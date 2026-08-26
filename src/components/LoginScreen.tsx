import React, { useState } from 'react';
import { useCRM } from '../store';
import {
  Lock, ArrowRight, ShieldCheck, Mail, CheckCircle2, ShieldAlert,
  ArrowLeft, Eye, Layout, Upload, Camera, Video, UserCheck, Smartphone
} from 'lucide-react';
import FruitsFlowersLogo from './FruitsFlowersLogo';
import { uploadFileToStorage } from '../utils/storageUpload';

export default function LoginScreen() {
  const { loginWithEmailPassword, registerWithEmailPassword, resetPasswordWithEmail, brandConfig, addReferral } = useCRM();
  
  // Primary Auth States (Firebase Email & Password)
  const [emailInput, setEmailInput] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot Password / Recovery States (Firebase Password Reset)
  const [loginMode, setLoginMode] = useState<'login' | 'forgot' | 'sent'>('login');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // User / Referral Registration States
  const [isRegistering, setIsRegistering] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regAddress, setRegAddress] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regPhoto, setRegPhoto] = useState('');
  const [regSuccess, setRegSuccess] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regLoading, setRegLoading] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);

  // Profile picture module camera states
  const [useCamera, setUseCamera] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const startCamera = async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 300, height: 300, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error(err);
      setCameraError('Unable to access camera. Please verify browser permissions or upload an image file.');
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const captureSelfieFile = () => {
    if (videoRef.current && cameraActive) {
      const canvas = document.createElement('canvas');
      canvas.width = 300;
      canvas.height = 300;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const video = videoRef.current;
        const videoWidth = video.videoWidth || 300;
        const videoHeight = video.videoHeight || 300;
        const size = Math.min(videoWidth, videoHeight);
        const sx = (videoWidth - size) / 2;
        const sy = (videoHeight - size) / 2;
        ctx.drawImage(video, sx, sy, size, size, 0, 0, 300, 300);

        canvas.toBlob(async (blob) => {
          if (!blob) return setRegError('Failed to capture frames. Please try image upload.');
          try {
            const { downloadUrl } = await uploadFileToStorage(new File([blob], 'referral-selfie.jpg', { type: 'image/jpeg' }), `attachments/referrals/pending-${Date.now()}/photo.jpg`);
            setRegPhoto(downloadUrl);
            stopCamera();
            setUseCamera(false);
            setRegError(null);
          } catch {
            setRegError('Failed to upload captured photo. Please try image upload.');
          }
        }, 'image/jpeg', 0.85);
      }
    }
  };

  const handleRegPhotoUpload = (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setRegError('Photo file size should not exceed 5MB.');
      return;
    }
    uploadFileToStorage(file, `attachments/referrals/pending-${Date.now()}/photo`).then(({ downloadUrl }) => {
      setRegPhoto(downloadUrl);
      setRegError(null);
    }).catch(() => setRegError('Failed to upload photo.'));
  };

  React.useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const renderLogoSymbol = (classes = "w-8 h-8") => {
    const logoType = brandConfig.logoType || 'fruits_flowers';
    if (logoType === 'fruits_flowers') {
      return (
        <div className={`${classes} flex items-center justify-center overflow-hidden shrink-0`}>
          <FruitsFlowersLogo size="100%" />
        </div>
      );
    }
    if (logoType === 'apps_grid') {
      return (
        <div className={`${classes} flex items-center justify-center text-indigo-500 shrink-0`}>
          <Layout className="w-5 h-5" />
        </div>
      );
    }
    if (logoType === 'custom_url' && brandConfig.logoUrl) {
      return (
        <img
          src={brandConfig.logoUrl}
          alt="Brand Logo"
          className={`${classes} object-contain shrink-0`}
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).src = '/Logo.png';
          }}
        />
      );
    }
    return (
      <div className={`${classes} bg-transparent flex items-center justify-center font-extrabold text-[#747ff1] text-base shrink-0`}>
        {brandConfig.brandName?.[0] || 'V'}
      </div>
    );
  };

  // Firebase Authentication Login Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!emailInput.trim()) {
      setError('Please enter your registered email address.');
      return;
    }
    if (!emailPassword.trim()) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    const res = await loginWithEmailPassword(emailInput.trim(), emailPassword);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Authentication failed. Please verify your email and password.');
    }
  };

  // Firebase Authentication Password Reset Handler
  const handleSendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);

    if (!forgotEmail.trim()) {
      setForgotError('Please enter your registered email address.');
      return;
    }

    setForgotLoading(true);
    const res = await resetPasswordWithEmail(forgotEmail.trim());
    setForgotLoading(false);

    if (res.success) {
      setLoginMode('sent');
    } else {
      setForgotError(res.error || 'Failed to dispatch password reset email.');
    }
  };

  // Firebase Authentication User Registration Handler
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);

    if (!regName.trim()) {
      setRegError('Full Name is required.');
      return;
    }
    if (!regEmail.trim()) {
      setRegError('Email address is required for Firebase Authentication.');
      return;
    }
    if (!regPassword.trim() || regPassword.trim().length < 6) {
      setRegError('Password must be at least 6 characters long for Firebase Authentication.');
      return;
    }

    setRegLoading(true);
    try {
      const res = await registerWithEmailPassword(regEmail.trim(), regPassword.trim(), regName.trim(), 'Referral Team');
      if (res.success && res.user) {
        addReferral({
          name: regName.trim(),
          email: regEmail.trim(),
          mobileNumber: regMobile.trim() || undefined,
          address: regAddress.trim(),
          photo: regPhoto || undefined,
          securityRoleProfile: 'Referral Team',
        }, true);

        setRegLoading(false);
        setRegSuccess(true);
        setEmailInput(regEmail.trim());
        setEmailPassword(regPassword.trim());

        setRegName('');
        setRegEmail('');
        setRegPassword('');
        setRegAddress('');
        setRegMobile('');
        setRegPhoto('');
      } else {
        setRegLoading(false);
        setRegError(res.error || 'Registration failed. Please try again.');
      }
    } catch (err: any) {
      setRegLoading(false);
      setRegError(err?.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center items-center p-4 antialiased selection:bg-indigo-500/20 select-none animate-fadeIn transition-all duration-500 relative overflow-x-hidden"
      id="login-portal-root"
    >

      {/* Fully absolute backdrop image overlay within the portal node */}
      {brandConfig.layoutStyle === 'backdrop' && (
        <div
          className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-500"
          style={{ backgroundImage: `url(${brandConfig.imageUrl})` }}
        />
      )}

      {/* Blurred overlay if background layout is active */}
      {brandConfig.layoutStyle === 'backdrop' && (
        <div
          className="absolute inset-0 z-0 pointer-events-none transition-all duration-300 backdrop-blur-[6px]"
          style={{ backgroundColor: `rgba(15, 15, 20, ${brandConfig.overlayOpacity / 100})` }}
        />
      )}

      {/* Decorative grid lines */}
      {brandConfig.layoutStyle !== 'backdrop' && (
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ebdcb940_1px,transparent_1px),linear-gradient(to_bottom,#ebdcb940_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
      )}

      {/* Main card panel - Responsive flex split width */}
      <div
        className={`w-full ${brandConfig.layoutStyle === 'split' ? 'max-w-4xl' : 'max-w-sm'} bg-white border border-[#ebdcb9] rounded-3xl overflow-hidden shadow-2xl relative z-10 flex flex-col md:flex-row transition-all duration-300`}
        id="login-container"
      >

        {/* Left pane: Brand Split Image */}
        {brandConfig.layoutStyle === 'split' && (
          <div
            className="hidden md:flex md:w-1/2 relative bg-slate-900 flex-col justify-between p-8 text-white overflow-hidden min-h-[580px]"
            style={{
              backgroundImage: `url(${brandConfig.imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none transition-opacity duration-300"
              style={{ backgroundColor: `rgba(0, 0, 0, ${brandConfig.overlayOpacity / 100})` }}
            />

            <div className="relative z-10 flex items-center gap-2">
              {renderLogoSymbol("w-8 h-8 bg-white/10 backdrop-blur-sm border border-white/20")}
              <span className="font-extrabold uppercase tracking-widest text-[11px] text-white/90">
                {brandConfig.brandName} Secure Center
              </span>
            </div>

            <div className="relative z-10 my-auto py-10 space-y-3">
              <div className="inline-block px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-emerald-400 font-extrabold uppercase text-[8px] tracking-widest border border-emerald-500/30">
                🔥 FIREBASE AUTHENTICATION SECURED
              </div>
              <h2 className="text-3xl font-black tracking-tight leading-tight uppercase font-sans text-white">
                {brandConfig.brandName}
              </h2>
              <p className="font-semibold text-slate-300 text-xs tracking-wide leading-relaxed">
                {brandConfig.brandTagline}
              </p>
              <div className="pt-4 flex gap-1.5 items-center text-[10px] text-slate-400 font-mono font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>FIREBASE CLOUD AUTH ENCRYPTED HANDSHAKE</span>
              </div>
            </div>

            <div className="relative z-10 space-y-1 text-left">
              <div className="w-full h-[1px] bg-white/10 mb-3" />
              <div className="flex justify-between items-center text-[9px] text-white/60 font-mono uppercase font-semibold">
                <span>Access Terminal Active</span>
                <span className="text-emerald-400">● Firebase Live Auth</span>
              </div>
            </div>
          </div>
        )}

        {/* Right pane: Standard Form Container */}
        <div className={`w-full ${brandConfig.layoutStyle === 'split' ? 'md:w-1/2' : 'w-full'} p-6 md:p-8 flex flex-col justify-between space-y-6 relative bg-white`}>

          {/* Top Custom Hero Header Image */}
          {((brandConfig.layoutStyle === 'compact') || (brandConfig.layoutStyle === 'split')) && (
            <div className={`w-full relative h-[120px] rounded-2xl overflow-hidden shadow-inner mb-2 ${brandConfig.layoutStyle === 'split' ? 'md:hidden block' : 'block'}`} id="compact-brand-image-band">
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-300"
                style={{ backgroundImage: `url(${brandConfig.imageUrl})` }}
              />
              <div
                className="absolute inset-0 pointer-events-none transition-opacity duration-300"
                style={{ backgroundColor: `rgba(0, 0, 0, ${brandConfig.overlayOpacity / 100})` }}
              />
              <div className="absolute inset-0 flex flex-col justify-end p-4 text-white">
                <h1 className="text-base font-black tracking-tight leading-none uppercase text-white">{brandConfig.brandName}</h1>
                <p className="text-[8px] text-slate-205 tracking-wider font-extrabold mt-1">{brandConfig.brandTagline}</p>
              </div>
            </div>
          )}

          {/* Standard Logo Brand Presentation */}
          {brandConfig.layoutStyle !== 'compact' && (
            <div className={`text-center space-y-3 ${brandConfig.layoutStyle === 'split' ? 'hidden md:block' : 'block'}`} id="login-brand-info">
              <div className="flex items-center justify-center gap-2.5">
                {renderLogoSymbol("w-12 h-12")}
                <div className="text-left leading-none">
                  <h1 className="text-base font-black text-[#2b251a] tracking-tight">{brandConfig.brandName}</h1>
                  <p className="text-[9px] text-[#6b5d49] font-extrabold tracking-wider leading-none mt-0.5">{brandConfig.brandTagline}</p>
                </div>
              </div>
            </div>
          )}

          {!isRegistering ? (
            loginMode === 'forgot' ? (
              /* Firebase Password Reset Form */
              <div className="animate-fadeIn space-y-5" id="forgot-password-panel">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('login');
                    setForgotError(null);
                    setForgotEmail('');
                  }}
                  className="text-[#6b5d49] hover:text-[#2b251a] flex items-center gap-1 text-[9px] font-bold uppercase transition focus:outline-none cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" /> Back to Login
                </button>

                <div className="text-center space-y-1.5 mt-2">
                  <div className="w-10 h-10 rounded-xl bg-[var(--cream-bg)] border border-[var(--cream-border)] text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                    <Mail className="w-4.5 h-4.5" />
                  </div>
                  <h3 className="text-xs font-black text-[#2b251a] tracking-wider uppercase">Firebase Password Reset</h3>
                  <p className="text-[10px] text-[#6b5d49] tracking-wide font-medium uppercase font-mono">ACCOUNT RECOVERY LINK</p>
                </div>

                <p className="text-[#6b5d49] text-[10.5px] leading-relaxed text-center">
                  Enter your registered Firebase email address. We will dispatch a password reset link directly via Firebase Authentication.
                </p>

                <form onSubmit={handleSendResetLink} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-1">Firebase Email Address *</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#6b5d49]" />
                      <input
                        type="email"
                        placeholder="user@example.com"
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          setForgotError(null);
                        }}
                        className="w-full pl-10 pr-4 py-2.5 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-bold font-mono tracking-wider focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition"
                        required
                      />
                    </div>
                  </div>

                  {forgotError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[10px] font-bold tracking-wide animate-shake flex items-start gap-2">
                      <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                      <span>{forgotError}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 font-extrabold text-white rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-lg shadow-indigo-600/10 disabled:opacity-75"
                  >
                    {forgotLoading ? (
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>Sending Link...</span>
                      </div>
                    ) : (
                      <>
                        <span>Send Password Reset Email</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : loginMode === 'sent' ? (
              /* Password Reset Confirmation Panel */
              <div className="animate-fadeIn space-y-5 text-center" id="reset-link-sent-panel">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('login');
                    setForgotEmail('');
                  }}
                  className="text-[#6b5d49] hover:text-[#2b251a] flex items-center gap-1 text-[9px] font-bold uppercase transition focus:outline-none cursor-pointer"
                >
                  <ArrowLeft className="w-3 h-3" /> Back to Login
                </button>

                <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-6 h-6" />
                </div>

                <div className="space-y-1">
                  <h3 className="text-xs font-black text-[#2b251a] tracking-wider uppercase">Reset Link Dispatched</h3>
                  <p className="text-[10px] text-emerald-600 tracking-wide font-black uppercase font-mono">FIREBASE AUTH EMAIL SENT</p>
                </div>

                <div className="p-4 bg-[#fffefb] border border-[#e3d3be] rounded-2xl text-center space-y-2">
                  <p className="text-[10.5px] text-[#6b5d49] leading-relaxed">
                    Firebase Authentication has dispatched a password reset link to your email inbox:
                  </p>
                  <div className="inline-block px-3 py-1.5 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-100 font-mono">
                    {forgotEmail}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setLoginMode('login')}
                  className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 font-extrabold text-white rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
                >
                  Return to Login
                </button>
              </div>
            ) : (
              /* Main Firebase Authentication Login Form */
              <>
                <div className="text-center space-y-1.5">
                  <div className="w-10 h-10 rounded-xl bg-[var(--cream-bg)] border border-[var(--cream-border)] text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
                    <Lock className="w-4.5 h-4.5" />
                  </div>
                  <h3 className="text-xs font-black text-[#2b251a] tracking-wider uppercase">
                    {brandConfig.welcomeHeader === 'Credentials Verification' ? 'Login to Leafy Server' : (brandConfig.welcomeHeader || 'Login to Leafy Server')}
                  </h3>
                </div>

                {successBanner && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[10px] font-bold tracking-wide animate-fadeIn flex items-center gap-2" id="login-success-banner">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{successBanner}</span>
                    <button
                      type="button"
                      onClick={() => setSuccessBanner(null)}
                      className="ml-auto text-emerald-600 hover:text-emerald-800 font-extrabold focus:outline-none"
                    >
                      ×
                    </button>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4" id="credentials-verification-form">
                  <div className="space-y-1.5">
                    <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-1">Registered Email *</label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#6b5d49]" />
                      <input
                        type="email"
                        placeholder="user@example.com"
                        value={emailInput}
                        onChange={(e) => {
                          setEmailInput(e.target.value);
                          setError(null);
                        }}
                        id="login-email-input"
                        disabled={loading}
                        className="w-full pl-10 pr-4 py-2.5 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-bold font-mono tracking-wider focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition disabled:opacity-50"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center pr-1">
                      <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-1">Password *</label>
                      <button
                        type="button"
                        onClick={() => {
                          setLoginMode('forgot');
                          setForgotError(null);
                          setForgotEmail(emailInput);
                        }}
                        className="text-[8.5px] font-bold text-indigo-600 hover:underline hover:text-indigo-500 uppercase tracking-wider focus:outline-none cursor-pointer"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[#6b5d49]" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={emailPassword}
                        onChange={(e) => {
                          setEmailPassword(e.target.value);
                          setError(null);
                        }}
                        id="login-password-input"
                        disabled={loading}
                        className="w-full pl-10 pr-10 py-2.5 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-bold font-mono tracking-wider focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/40 transition disabled:opacity-50"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b5d49] hover:text-indigo-600 transition"
                        title={showPassword ? "Hide" : "Show"}
                      >
                        <Eye className="w-4 h-4 opacity-70" />
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[10px] font-bold tracking-wide animate-shake flex items-center gap-2" id="login-error-toast">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={!emailInput.trim() || !emailPassword.trim() || loading}
                    id="login-submit-btn"
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 font-extrabold text-white rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-lg shadow-indigo-600/10 disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        <span>Authenticating via Firebase...</span>
                      </div>
                    ) : (
                      <>
                        <span>Login with Firebase</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Referral Registration Button */}
                <div className="pt-4 border-t border-[#ebdcb9] text-center space-y-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsRegistering(true);
                      setRegSuccess(false);
                      setRegError(null);
                    }}
                    className="px-4 py-2 w-full bg-teal-50 hover:bg-teal-100 text-teal-700 font-black rounded-xl text-[10px] uppercase tracking-wider border border-teal-200 transition cursor-pointer select-none"
                    id="toggle-referral-register"
                  >
                    New User Creation 🤝
                  </button>
                </div>
              </>
            )
          ) : regSuccess ? (
            /* Registration Success Screen */
            <div className="text-center space-y-5 animate-fadeIn" id="registration-success-panel">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-6 h-6 font-black" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xs font-black text-[#2b251a] uppercase tracking-wider">Account Created</h3>
                <p className="text-[9px] text-[#6b5d49] tracking-wide font-black uppercase font-mono">FIREBASE USER REGISTERED</p>
              </div>
              <p className="text-[#6b5d49] text-[10.5px] leading-relaxed">
                Welcome to {brandConfig.brandName}! Your Firebase Authentication account has been created successfully.
              </p>

              <button
                type="button"
                onClick={() => {
                  setIsRegistering(false);
                  setRegSuccess(false);
                }}
                className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-500 font-extrabold text-white rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Proceed to App Dashboard
              </button>
            </div>
          ) : (
            /* Firebase Registration Form */
            <div className="animate-fadeIn space-y-4" id="referral-registration-panel">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(false);
                  setRegError(null);
                }}
                className="text-[#6b5d49] hover:text-[#2b251a] flex items-center gap-1 text-[9px] font-bold uppercase transition focus:outline-none cursor-pointer"
              >
                <ArrowLeft className="w-3 h-3" /> Back to Login
              </button>

              <div className="text-center space-y-1">
                <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center mx-auto shadow-inner">
                  <UserCheck className="w-4.5 h-4.5" />
                </div>
                <h3 className="text-xs font-black text-[#2b251a] uppercase tracking-wider">New Firebase User Registration</h3>
                <p className="text-[9px] text-teal-700 font-mono font-bold">CREATE FIREBASE CLOUD ACCOUNT</p>
              </div>

              {regError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-[10px] font-bold animate-shake flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{regError}</span>
                </div>
              )}

              <form onSubmit={handleRegisterSubmit} className="space-y-3">
                <div className="space-y-1">
                  <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-0.5">Full Name *</label>
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={regName}
                    onChange={(e) => {
                      setRegName(e.target.value);
                      setRegError(null);
                    }}
                    className="w-full p-2 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-semibold focus:outline-none focus:border-teal-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-0.5">Firebase Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b5d49]" />
                    <input
                      type="email"
                      placeholder="user@example.com"
                      value={regEmail}
                      onChange={(e) => {
                        setRegEmail(e.target.value);
                        setRegError(null);
                      }}
                      className="w-full pl-9 pr-3 py-2 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-semibold focus:outline-none focus:border-teal-700"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between items-center pr-1">
                    <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-0.5">Firebase Account Password *</label>
                    <span className="text-[8px] font-bold text-teal-800 bg-teal-50 px-1 py-0.5 rounded">min 6 chars</span>
                  </div>
                  <div className="relative">
                    <input
                      type={showRegPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => {
                        setRegPassword(e.target.value);
                        setRegError(null);
                      }}
                      className="w-full p-2.5 pr-10 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-semibold focus:outline-none focus:border-teal-500 font-mono"
                      required
                      id="onboard-security-password-field"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b5d49] hover:text-teal-700 transition"
                      title={showRegPassword ? "Hide Password" : "Show Password"}
                    >
                      <Eye className="w-4 h-4 opacity-70" />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-0.5">Mobile Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="+91 9876543210"
                    value={regMobile}
                    onChange={(e) => {
                      setRegMobile(e.target.value);
                      setRegError(null);
                    }}
                    className="w-full p-2 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-semibold focus:outline-none focus:border-teal-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-0.5">Physical Address (Optional)</label>
                  <input
                    type="text"
                    placeholder="Address"
                    value={regAddress}
                    onChange={(e) => {
                      setRegAddress(e.target.value);
                      setRegError(null);
                    }}
                    className="w-full p-2 bg-[#fffefb] border border-[#e3d3be] rounded-xl text-[#2b251a] text-xs font-semibold focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Profile Picture Option Selector */}
                <div className="p-3 bg-[var(--cream-bg)] border border-[var(--cream-border)] rounded-xl space-y-3" id="registration-photo-panel">
                  <div className="flex justify-between items-center">
                    <span className="block text-[8px] font-black text-[#6b5d49] uppercase tracking-widest pl-0.5">Profile Picture Source</span>
                    {regPhoto && (
                      <div className="flex items-center gap-1 bg-[#fffefb] px-2 py-0.5 rounded-full border border-teal-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                        <span className="text-[8px] font-bold text-emerald-700 uppercase">Set</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUseCamera(false);
                        stopCamera();
                        setCameraError(null);
                      }}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-[10px] font-extrabold uppercase tracking-wide transition select-none ${!useCamera
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-[#6b5d49] border-[#e3d3be] hover:border-[#6b5d49]'
                        }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUseCamera(true);
                        setCameraError(null);
                        startCamera();
                      }}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-[10px] font-extrabold uppercase tracking-wide transition select-none ${useCamera
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-[#6b5d49] border-[#e3d3be] hover:border-[#6b5d49]'
                        }`}
                    >
                      <Camera className="w-3.5 h-3.5" />
                      Take Selfie
                    </button>
                  </div>

                  {!useCamera ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div
                          onClick={() => document.getElementById('reg-partner-photo-file')?.click()}
                          className="flex-1 border border-dashed border-[#e3d3be] hover:border-teal-500 rounded-xl py-2 px-3 text-center cursor-pointer bg-white transition select-none flex items-center justify-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                          <span className="text-[10px] font-bold text-[#6b5d49]">Browse Files...</span>
                        </div>
                        <input
                          type="file"
                          id="reg-partner-photo-file"
                          className="hidden"
                          accept="image/*"
                          onChange={(e) => {
                            if (e.target.files && e.target.files[0]) {
                              handleRegPhotoUpload(e.target.files[0]);
                            }
                          }}
                        />

                        {regPhoto && (
                          <div className="flex items-center gap-1.5 shrink-0 bg-[#fffefb] p-1 rounded-lg border border-[#e3d3be]">
                            <img
                              src={regPhoto}
                              alt="Reg Preview"
                              className="w-8 h-8 rounded-full object-cover border border-[#e3d3be]"
                              referrerPolicy="no-referrer"
                            />
                            <button
                              type="button"
                              onClick={() => setRegPhoto('')}
                              className="text-[8px] text-red-600 font-extrabold hover:underline px-1.5"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 bg-[#1c1917] p-2.5 rounded-lg border border-[#2b251a]">
                      {cameraError && (
                        <div className="p-2 bg-red-950/60 border border-red-900/50 rounded-lg text-red-400 text-[9px] font-semibold flex items-start gap-1">
                          <ShieldAlert className="w-3 h-3 shrink-0 mt-0.5" />
                          <span>{cameraError}</span>
                        </div>
                      )}

                      <div className="relative w-full aspect-square max-w-[180px] mx-auto bg-black rounded-xl overflow-hidden border-2 border-slate-700 flex items-center justify-center">
                        {cameraActive ? (
                          <video
                            ref={videoRef}
                            className="w-full h-full object-cover rounded-xl"
                            playsInline
                            muted
                          />
                        ) : (
                          <div className="text-center p-3 space-y-2">
                            <Video className="w-7 h-7 text-slate-600 mx-auto animate-pulse" />
                            <p className="text-[8px] text-slate-400 uppercase tracking-wider font-extrabold">Camera Feed Offline</p>
                            <button
                              type="button"
                              onClick={startCamera}
                              className="px-2.5 py-1 bg-teal-600 hover:bg-teal-500 text-white rounded text-[8px] font-extrabold uppercase tracking-widest transition"
                            >
                              Start Webcam
                            </button>
                          </div>
                        )}

                        {cameraActive && (
                          <span className="absolute top-2 left-2 px-1.5 py-0.5 bg-red-600 text-white text-[7px] font-black uppercase tracking-widest rounded animate-pulse">
                            Live Recording
                          </span>
                        )}
                      </div>

                      <div className="flex justify-between gap-1.5">
                        {cameraActive ? (
                          <>
                            <button
                              type="button"
                              onClick={captureSelfieFile}
                              className="flex-1 py-1.5 px-3 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center justify-center gap-1"
                            >
                              <Camera className="w-3 h-3" />
                              Capture Selfie
                            </button>
                            <button
                              type="button"
                              onClick={stopCamera}
                              className="py-1.5 px-2.5 bg-red-900 hover:bg-red-800 text-red-100 rounded-lg text-[9px] font-extrabold uppercase"
                            >
                              Stop
                            </button>
                          </>
                        ) : (
                          regPhoto && (
                            <div className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-500 p-1.5 rounded-lg">
                              <div className="flex items-center gap-1.5">
                                <img
                                  src={regPhoto}
                                  alt="Selfie Preview"
                                  className="w-8 h-8 rounded-full object-cover border border-zinc-700"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="text-[9px] text-[#e3d3be] font-bold">Selfie Captured</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => setRegPhoto('')}
                                className="text-[9px] text-rose-400 font-extrabold hover:underline select-none px-2"
                              >
                                Clear Selfie
                              </button>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={regLoading}
                  className="w-full py-2.5 px-4 bg-teal-600 hover:bg-teal-500 font-extrabold text-white rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition duration-200 cursor-pointer shadow-lg shadow-teal-500/10"
                >
                  {regLoading ? (
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      <span>Creating Firebase Account...</span>
                    </div>
                  ) : (
                    <>
                      <span>Create Account & Register</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          <div className="pt-4 border-t border-[#ebdcb9] text-center space-y-2.5">
            <div className="bg-[var(--cream-bg)] border border-[var(--cream-border)] rounded-2xl p-3 text-[10.5px] text-[#6b5d49] space-y-1">
              <p className="font-black text-[#2b251a] uppercase tracking-wider text-[8px] mb-1">Customer Care Support</p>
              <p className="font-medium flex items-center justify-center gap-1">
                <span>Mobile:</span>
                <a href="tel:+918547927539" className="text-indigo-600 hover:underline font-bold font-mono">+91 8547 927 539</a>
              </p>
              <p className="font-medium flex items-center justify-center gap-1">
                <span>Email:</span>
                <a href="mailto:sales@vamjo.com" className="text-indigo-600 hover:underline font-bold font-sans">sales@vamjo.com</a>
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
