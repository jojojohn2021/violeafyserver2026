import React, { useState } from 'react';
import { useCRM } from '../store';
import { User, UserRole } from '../types';
import { 
  Users, UserPlus, Trash2, Edit3, Check, X, Search, Shield, Phone, 
  Mail, Key, ShieldAlert, CheckCircle2, UserCheck, HelpCircle, Upload 
} from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUpload';

const TEAM_AVATARS = [
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&h=100&fit=crop&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop&q=80',
  'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop&q=80',
  'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=100&h=100&fit=crop&q=80',
];

const ROLES: UserRole[] = ['Admin', 'Sales', 'Marketing', 'Support', 'Referral Team'];

const TEAM_TAGS = [
  'Executive Leadership',
  'Outbound SFA Force',
  'Analytics & Digital Demand',
  'Customer Relations & Care',
  'Referral Team'
];

export default function UserManagementView() {
  const { 
    currentUser, 
    registeredUsers, 
    addUser, 
    updateUser, 
    deleteUser, 
    hasAccess 
  } = useCRM();

  // Navigation / search states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRoleFilter, setSelectedRoleFilter] = useState('all');

  // Form states (Add User)
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('Sales');
  const [email, setEmail] = useState('');
  const [avatar, setAvatar] = useState(TEAM_AVATARS[0]);
  const [team, setTeam] = useState('Outbound SFA Force');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('1234');

  // Form states (Edit User)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('Sales');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editTeam, setEditTeam] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editPassword, setEditPassword] = useState('');

  // Sync default team when role selection changes
  React.useEffect(() => {
    switch (role) {
      case 'Admin':
        setTeam('Executive Leadership');
        break;
      case 'Sales':
        setTeam('Outbound SFA Force');
        break;
      case 'Marketing':
        setTeam('Analytics & Digital Demand');
        break;
      case 'Support':
        setTeam('Customer Relations & Care');
        break;
      case 'Referral Team':
        setTeam('Referral Team');
        break;
    }
  }, [role]);

  // Status feedback states
  const [valError, setValError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);

  // Security action validation check
  const writeAllowed = hasAccess('Security Audit', 'create') || currentUser.role === 'Admin';

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const cleanPhone = (num: string) => num.replace(/\D/g, '');

  const handlePhotoUpload = async (file: File, isEditMode: boolean) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setValError('Only image file types (.png, .jpg, .jpeg, etc.) are allowed for user photos.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setValError('Image file size must be less than 2MB.');
      return;
    }

    try {
      const { downloadUrl } = await uploadFileToStorage(file, `users/pending-${Date.now()}/avatar`);
      if (isEditMode) setEditAvatar(downloadUrl);
      else setAvatar(downloadUrl);
      showSuccess('Custom photo uploaded successfully.');
    } catch {
      setValError('Failed to upload image file.');
    }
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setValError(null);

    if (!writeAllowed) {
      setValError('Unauthorized operation. Administrative privilege is required.');
      return;
    }

    if (!name.trim() || !mobileNumber.trim() || !password.trim()) {
      setValError('Name, Mobile Number, and Security Password fields are required.');
      return;
    }

    const cleanInputMobile = cleanPhone(mobileNumber);
    if (cleanInputMobile.length < 5) {
      setValError('Please provide a valid mobile signature or number.');
      return;
    }

    // Explicit unique check in component state too for instant responsive UX
    const phoneExists = registeredUsers.some(
      u => cleanPhone(u.mobileNumber || '') === cleanInputMobile
    );

    if (phoneExists) {
      setValError(`Database conflict: Mobile key ${mobileNumber} is already allocated to another profile.`);
      return;
    }

    const success = addUser({
      name: name.trim(),
      role,
      email: email.trim() || `${name.trim().toLowerCase().replace(/\s+/g, '')}@viocrm.com`,
      avatar,
      team: team.trim() || `${role} Operations Force`,
      mobileNumber: mobileNumber.trim(),
      password: password.trim()
    });

    if (success) {
      showSuccess(`Profile for "${name}" generated safely.`);
      setIsAdding(false);
      // Reset form variables
      setName('');
      setRole('Sales');
      setEmail('');
      setAvatar(TEAM_AVATARS[0]);
      setTeam('');
      setMobileNumber('');
      setPassword('1234');
    } else {
      setValError('Registration aborted. A collision with unique mobile keys was detected.');
    }
  };

  const handleStartEditing = (user: User) => {
    setEditingId(user.id);
    setEditName(user.name);
    setEditRole(user.role);
    setEditEmail(user.email);
    setEditAvatar(user.avatar);
    setEditTeam(user.team);
    setEditMobile(user.mobileNumber || '');
    setEditPassword(user.password || '1234');
    setValError(null);
  };

  const handleSaveUpdate = (id: string) => {
    setValError(null);

    if (!writeAllowed) {
      setValError('Unauthorized operation. Administrative level permission is required.');
      return;
    }

    if (!editName.trim() || !editMobile.trim() || !editPassword.trim()) {
      setValError('Required fields: Name, Mobile Key, and Access Password must not be blank.');
      return;
    }

    const cleanEditMobile = cleanPhone(editMobile);
    // Unique check
    const duplicateExists = registeredUsers.some(
      u => u.id !== id && cleanPhone(u.mobileNumber || '') === cleanEditMobile
    );

    if (duplicateExists) {
      setValError(`Update failed: Mobile credential ${editMobile} is already bound to another profile.`);
      return;
    }

    const success = updateUser(id, {
      name: editName.trim(),
      role: editRole,
      email: editEmail.trim(),
      avatar: editAvatar,
      team: editTeam.trim(),
      mobileNumber: editMobile.trim(),
      password: editPassword.trim()
    });

    if (success) {
      showSuccess('Profile update handshake successful.');
      setEditingId(null);
    } else {
      setValError('Could not persist changes due to verification constraints.');
    }
  };

  const handleDeleteClick = (user: User) => {
    if (!writeAllowed) {
      setValError('Administrative Access Level Required to dismiss workspace agents.');
      return;
    }
    setDeleteConfirmUser(user);
  };

  // Filtering
  const filteredUsers = registeredUsers.filter(user => {
    const term = searchTerm.toLowerCase();
    const matchesSearch = 
      (user.name || '').toLowerCase().includes(term) ||
      (user.email || '').toLowerCase().includes(term) ||
      (user.mobileNumber || '').toLowerCase().includes(term) ||
      (user.team || '').toLowerCase().includes(term);

    const matchesRole = selectedRoleFilter === 'all' || user.role === selectedRoleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6" id="user-management-core">
      {/* Header and Add button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4" id="user-header-panel">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <h1 className="text-xl font-black text-white tracking-tight">Active Team Roster</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Maintain registered terminal identities, passwords, and access constraints. Mobile numbers act as unique access keys.
          </p>
        </div>

        {writeAllowed && !isAdding && (
          <button
            onClick={() => {
              setIsAdding(true);
              setEditingId(null);
              setValError(null);
            }}
            id="btn-trigger-add-user"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition duration-150 flex items-center gap-2 cursor-pointer shadow-lg shadow-indigo-600/15"
          >
            <UserPlus className="w-4 h-4" />
            <span>Enroll New Agent</span>
          </button>
        )}
      </div>

      {/* Verification alerts */}
      {valError && (
        <div className="p-4 bg-rose-950/20 border border-rose-900/40 text-rose-400 rounded-2xl text-xs font-bold leading-relaxed flex items-start gap-3 animate-shake" id="user-val-error">
          <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-extrabold uppercase text-[10px] tracking-wide block">Verification Flag Raised</span>
            <p className="mt-0.5 text-[11px]">{valError}</p>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 text-emerald-400 rounded-2xl text-xs font-bold flex items-start gap-3" id="user-success-toast">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-extrabold uppercase text-[10px] tracking-wide block">System Synchronized</span>
            <p className="mt-0.5 text-[11px]">{successMsg}</p>
          </div>
        </div>
      )}

      {/* Form: Add Agent */}
      {isAdding && (
        <form onSubmit={handleCreateUser} className="bg-[#0c0c0f] border border-slate-800 rounded-2xl p-5 md:p-6 space-y-4" id="form-enroll-agent">
          <div className="flex items-center justify-between pb-3 border-b border-slate-850">
            <h3 className="text-sm font-black text-white hover:text-indigo-400 tracking-wider uppercase flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-400" />
              <span>Configure System Security Credentials</span>
            </h3>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg transition"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">Agent Legal Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Wanda Maximoff"
                className="w-full px-3 py-2 bg-[#121215] border border-slate-800 rounded-xl text-white text-xs font-bold leading-relaxed focus:outline-none focus:border-indigo-500 transition"
                required
              />
            </div>

            {/* Mobile Key (Unique Constraint) */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">Unique Mobile Key *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 8547856353"
                  className="w-full pl-9 pr-3 py-2 bg-[#121215] border border-slate-800 rounded-xl text-white text-xs font-mono font-bold leading-relaxed focus:outline-none focus:border-indigo-500 transition"
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">Security Passcode *</label>
              <div className="relative">
                <Key className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="e.g. 1234"
                  className="w-full pl-9 pr-3 py-2 bg-[#121215] border border-slate-800 rounded-xl text-white text-xs font-mono font-bold leading-relaxed focus:outline-none focus:border-indigo-500 transition"
                  required
                />
              </div>
            </div>

            {/* Role Profile */}
            {currentUser?.role === 'Admin' && (
              <div className="space-y-1.5">
                <label className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">Corporate Role Level</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 bg-[#121215] border border-slate-800 rounded-xl text-white text-xs font-bold leading-relaxed focus:outline-none focus:border-indigo-500 transition"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">Secure Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. wanda@viocrm.com"
                  className="w-full pl-9 pr-3 py-2 bg-[#121215] border border-slate-800 rounded-xl text-white text-xs font-bold leading-relaxed focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Team */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">Team Department Tag</label>
              <select
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className="w-full px-3 py-2 bg-[#121215] border border-slate-800 rounded-xl text-white text-xs font-bold leading-relaxed focus:outline-none focus:border-indigo-500 transition text-slate-350"
              >
                {TEAM_TAGS.map(t => (
                  <option key={t} value={t} className="text-white bg-[#121215]">{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Avatar selection */}
          <div className="space-y-3 pt-2">
            <span className="block text-[9px] font-black tracking-widest text-slate-400 uppercase">Assign Agent Avatar Identifier</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start bg-[#0d0d11]/80 p-4 rounded-xl border border-slate-850">
              {/* Presets */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Choose a Preset</span>
                <div className="flex flex-wrap gap-2.5">
                  {TEAM_AVATARS.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => setAvatar(url)}
                      className={`relative rounded-full overflow-hidden border-2 transition ${
                        avatar === url ? 'border-indigo-500 scale-110 shadow-lg shadow-indigo-600/30' : 'border-transparent scale-100 hover:opacity-80'
                      }`}
                    >
                      <img src={url} alt={`Avatar option ${index + 1}`} className="w-9 h-9 object-cover" />
                      {avatar === url && (
                        <div className="absolute inset-0 bg-indigo-600/20 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white font-bold" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Upload custom box */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block">Or Upload Custom Photo</span>
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handlePhotoUpload(e.dataTransfer.files[0], false);
                    }
                  }}
                  onClick={() => document.getElementById('new-avatar-upload-file')?.click()}
                  className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 hover:bg-indigo-950/5 rounded-xl p-3 text-center cursor-pointer transition flex flex-col items-center justify-center gap-1.5 group select-none"
                >
                  <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-400 transition-colors" />
                  <div>
                    <span className="text-[10px] font-bold text-slate-300 block">Drag & drop photo here</span>
                    <span className="text-[8px] text-slate-500">or click to browse local files</span>
                  </div>
                  <input
                    type="file"
                    id="new-avatar-upload-file"
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handlePhotoUpload(e.target.files[0], false);
                      }
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Selected Active Avatar preview */}
            <div className="flex items-center gap-3 bg-[#0a0a0c]/85 p-2.5 rounded-xl border border-slate-900 mt-2">
              <img 
                src={avatar} 
                alt="Active Preview" 
                className="w-10 h-10 rounded-full object-cover border border-slate-800 shrink-0" 
                referrerPolicy="no-referrer" 
              />
              <div className="min-w-0 flex-1">
                <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wide block">Active Avatar Signature</span>
                <p className="text-[8px] text-slate-500 font-mono truncate max-w-full">
                  {avatar}
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-850">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-350 hover:text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition cursor-pointer shadow-md"
            >
              Commit Credentials
            </button>
          </div>
        </form>
      )}

      {/* Filtering Actions Panel */}
      <div className="bg-[#0c0c0f] border border-slate-850 p-4 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between" id="user-filter-controls">
        <div className="relative w-full md:max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search matching name, email, credentials, or team tags..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 bg-[#121215] border border-slate-800 rounded-xl text-xs font-bold focus:outline-none focus:border-indigo-500 transition text-white"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto shrink-0 justify-end">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest font-mono">Role Filter:</span>
            <select
              value={selectedRoleFilter}
              onChange={(e) => setSelectedRoleFilter(e.target.value)}
              className="px-3 py-1.5 bg-[#121215] border border-slate-800 rounded-xl text-slate-300 text-xs font-bold leading-none focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="all">All Access Profiles</option>
              {ROLES.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="px-3 py-1.5 bg-[#111114] border border-slate-800 text-[10px] font-mono text-slate-400 rounded-xl font-bold">
            Total Enrolled: <span className="text-white font-extrabold">{filteredUsers.length}</span>
          </div>
        </div>
      </div>

      {/* Users Desktop Table / Layout Grid */}
      <div className="bg-[#0c0c0f] border border-slate-800 rounded-2xl overflow-hidden" id="user-display-grid">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-850 bg-[#101014]">
                <th className="p-4 text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Identified Agent</th>
                <th className="p-4 text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Role Grid</th>
                <th className="p-4 text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Mobile Access Signature (Unique key)</th>
                <th className="p-4 text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Password</th>
                <th className="p-4 text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Email Node</th>
                <th className="p-4 text-right text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Administrative Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-850">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 text-xs font-medium italic">
                    No active team members matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isEditing = editingId === user.id;

                  return (
                    <tr 
                      key={user.id} 
                      className={`hover:bg-[#111114]/50 transition ${
                        user.id === currentUser.id ? 'bg-indigo-950/5' : ''
                      }`}
                    >
                      {/* Identified Agent */}
                      <td className="p-4">
                        {isEditing ? (
                          <div className="flex items-center gap-3 max-w-[280px]">
                            {/* Interactive Editable Thumbnail with D&D */}
                            <div className="relative shrink-0 select-none">
                              <div
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                                    handlePhotoUpload(e.dataTransfer.files[0], true);
                                  }
                                }}
                                onClick={() => document.getElementById(`edit-avatar-upload-${user.id}`)?.click()}
                                className="relative w-12 h-12 rounded-full overflow-hidden border border-indigo-500/80 cursor-pointer group/avatar shadow-inner shadow-black/80"
                                title="Click to browse or drag & drop photo directly"
                              >
                                <img
                                  src={editAvatar}
                                  alt={editName}
                                  className="w-full h-full object-cover group-hover/avatar:opacity-45 transition duration-150"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition duration-150 bg-black/40">
                                  <Upload className="w-3.5 h-3.5 text-white" />
                                </div>
                              </div>
                              <input
                                type="file"
                                id={`edit-avatar-upload-${user.id}`}
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    handlePhotoUpload(e.target.files[0], true);
                                  }
                                }}
                              />
                              <span className="text-[7px] text-indigo-400 font-bold block text-center mt-1 leading-none uppercase tracking-wider">
                                drag/click
                              </span>
                            </div>

                            <div className="space-y-1.5 flex-1 min-w-0">
                              <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="px-2 py-1 bg-[#16161a] border border-slate-700 rounded-lg text-xs font-bold text-white w-full"
                                required
                              />
                              <select
                                value={editTeam}
                                onChange={(e) => setEditTeam(e.target.value)}
                                className="px-2 py-1 bg-[#16161a] border border-slate-705 rounded-lg text-[11px] font-bold text-slate-350 w-full"
                              >
                                {TEAM_TAGS.map(t => (
                                  <option key={t} value={t} className="text-white bg-[#16161a]">{t}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <img 
                                src={user.avatar} 
                                alt={user.name} 
                                className="w-9 h-9 rounded-full border border-slate-800 object-cover" 
                                referrerPolicy="no-referrer"
                              />
                              {user.id === currentUser.id && (
                                <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-emerald-500 text-[8px] text-white font-extrabold flex items-center justify-center rounded-all shadow border border-[#0a0a0c] scale-90" title="You are currently authenticated as this identity.">
                                  ✓
                                </span>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-white hover:text-indigo-400 transition">{user.name}</span>
                                {user.id === currentUser.id && (
                                  <span className="px-1 text-[7px] bg-slate-800 text-slate-400 rounded-sm font-black uppercase tracking-wider font-mono">
                                    Self
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold block">{user.team || 'Unassigned Operations'}</span>
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Role level */}
                      <td className="p-4">
                        {isEditing && currentUser?.role === 'Admin' ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as UserRole)}
                            className="px-2 py-1 bg-[#16161a] border border-slate-700 rounded-lg text-xs font-bold text-white"
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border tracking-wider ${
                            user.role === 'Admin' ? 'bg-indigo-950/40 text-indigo-400 border-indigo-900/30' :
                            user.role === 'Sales' ? 'bg-[#0f2d20] text-emerald-400 border-emerald-900/30' :
                            user.role === 'Marketing' ? 'bg-amber-950/40 text-amber-400 border-amber-900/30' :
                            user.role === 'Referral Team' ? 'bg-teal-950/40 text-teal-400 border-teal-900/30' :
                            'bg-rose-950/40 text-rose-400 border-rose-900/30'
                          }`}>
                            {user.role}
                          </span>
                        )}
                      </td>

                      {/* Unique Mobile access signature */}
                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editMobile}
                            onChange={(e) => setEditMobile(e.target.value)}
                            className="px-2 py-1 bg-[#16161a] border border-slate-700 rounded-lg text-xs font-mono font-bold text-white w-36"
                            placeholder="Unique Mobile Number"
                            required
                          />
                        ) : (
                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-indigo-400 bg-indigo-950/10 border border-indigo-900/10 px-2 py-1 rounded-lg w-max shadow-sm">
                            <Phone className="w-3 h-3 text-indigo-400" />
                            <span>{user.mobileNumber || 'None'}</span>
                          </div>
                        )}
                      </td>

                      {/* Password */}
                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="px-2 py-1 bg-[#16161a] border border-slate-700 rounded-lg text-xs font-mono font-bold text-white w-24"
                            placeholder="Passcode"
                            required
                          />
                        ) : (
                          <span className="text-xs font-mono text-slate-500 font-black tracking-widest bg-slate-900 px-2 py-1 rounded border border-slate-800">
                            {user.password || '••••'}
                          </span>
                        )}
                      </td>

                      {/* Email coordinate */}
                      <td className="p-4">
                        {isEditing ? (
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            className="px-2 py-1 bg-[#16161a] border border-slate-700 rounded-lg text-xs font-bold text-white w-full"
                          />
                        ) : (
                          <span className="text-xs text-slate-350 select-text font-medium">{user.email || 'N/A'}</span>
                        )}
                      </td>

                      {/* Access Controls */}
                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => handleSaveUpdate(user.id)}
                              className="p-1.5 bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-400 hover:text-emerald-300 rounded-lg border border-emerald-900/40 transition transition-discrete cursor-pointer"
                              title="Commit edits securely"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-lg border border-slate-800 transition cursor-pointer"
                              title="Discard updates"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 justify-end">
                            {writeAllowed ? (
                              <>
                                <button
                                  onClick={() => handleStartEditing(user)}
                                  className="p-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-indigo-400 rounded-lg border border-slate-800 transition cursor-pointer"
                                  title="Edit access variables"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(user)}
                                  className="p-1.5 bg-red-950/20 hover:bg-red-955/50 text-red-400 hover:text-red-300 rounded-lg border border-red-900/30 transition cursor-pointer"
                                  title="Dismiss agent profile"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            ) : (
                              <span className="text-[9px] text-slate-500 font-mono tracking-wide uppercase italic">
                                Read Only Access
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Guide Banner */}
      <div className="bg-[#0b0b0e] border border-slate-900 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-950/40 text-indigo-400 flex items-center justify-center border border-indigo-900/30 shadow-inner">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-wider font-mono">Administration Node Info</span>
            <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Adding or removing terminal permissions automatically updates trace audit logs on the <strong className="text-white font-black">Security & Access Grid</strong> for compliance mapping.
            </p>
          </div>
        </div>
      </div>
      
      {/* Delete User Confirmation Modal */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 bg-[#08080a]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn" id="delete-user-dialog">
          <div className="bg-[#101014] border border-red-900/30 max-w-md w-full rounded-2xl p-6 space-y-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-white uppercase tracking-wider font-mono">
                  {deleteConfirmUser.id === currentUser.id ? 'Revoke Own Administrative Profile?' : 'Dismiss Team Member Profile?'}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Are you absolutely sure you want to permanently clear <strong className="text-white font-bold">{deleteConfirmUser.name}</strong> from the team roster?
                </p>
                <p className="text-xs text-red-400 font-semibold leading-relaxed bg-red-950/20 border border-red-900/30 p-2.5 rounded-lg mt-2 font-mono">
                  {deleteConfirmUser.id === currentUser.id 
                    ? 'CRITICAL WARNING: This is your own profile! Proceeding will instantly terminate your session and sign you out of this workspace.'
                    : 'This action is irreversible. It will wipe this user profile and revoke all associated workspace authorizations immediately.'
                  }
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800/80">
              <button 
                type="button"
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-[#1b1b22] hover:text-white border border-slate-800 text-slate-350 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancel, Keep Profile
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteUser(deleteConfirmUser.id);
                  showSuccess(`User "${deleteConfirmUser.name}" revoked successfully.`);
                  setDeleteConfirmUser(null);
                }}
                className="px-4 py-2 bg-red-650 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border border-red-600/35"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Yes, Revoke Access</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
