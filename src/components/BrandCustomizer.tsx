import React, { useState } from 'react';
import { useCRM, DEFAULT_BRAND_CONFIG } from '../store';
import { BrandConfig } from '../types';
import { 
  Settings, Image as ImageIcon, Sliders, X, Sparkles, RefreshCw, Layout, Eye, Palette, Upload
} from 'lucide-react';
import FruitsFlowersLogo from './FruitsFlowersLogo';
import { uploadFileToStorage } from '../utils/storageUpload';

const BRAND_PRESETS = [
  {
    id: 'workspace',
    name: 'Modern Workspace',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200',
    description: 'Elegant high-contrast dark enterprise office with warm interior ambient lighting.'
  },
  {
    id: 'tech_grid',
    name: 'Abstract Tech Grid',
    url: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200',
    description: 'Clean matrix server lines with soft futuristic grid geometries.'
  },
  {
    id: 'cyberpunk_data',
    name: 'Cyberpunk Data Stream',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200',
    description: 'Pristine glowing high-tech neon data circuit and microchip details.'
  },
  {
    id: 'corporate_skyline',
    name: 'Corporate Highrise',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1200',
    description: 'Sleek glassy metropolitan real estate towers under twilight sky.'
  },
  {
    id: 'creative_studio',
    name: 'Creative Studio Light',
    url: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&q=80&w=1200',
    description: 'Bright Scandinavian minimal workspace featuring ambient indoor plant life.'
  }
];

export default function BrandCustomizer() {
  const { brandConfig, updateBrandConfig } = useCRM();
  const [customUrlInput, setCustomUrlInput] = useState(brandConfig.imageType === 'custom_url' ? brandConfig.imageUrl : '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [customWallpapers, setCustomWallpapers] = useState<Array<{ id: string; name: string; url: string; description: string }>>([]);

  const allWallpapers = [...BRAND_PRESETS, ...customWallpapers];

  const triggerSaveNotification = () => {
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return (
    <div className="space-y-6" id="brand-customizer-inline-panel">
      {/* Save Status Notification Banner */}
      {saveSuccess && (
        <div className="bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 p-4 rounded-2xl text-xs flex items-center gap-2.5 animate-fadeIn">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <p className="font-semibold">Brand display & visual configurations applied and saved successfully!</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Left Side: General Brand Meta & Presentation */}
        <div className="space-y-6">
          {/* Brand Identity Meta */}
          <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-slate-850 text-left">
            <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider font-mono flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              1. Brand Texts & Slogans
            </h4>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Brand Display Name</label>
                <input
                  type="text"
                  value={brandConfig.brandName}
                  onChange={(e) => {
                    updateBrandConfig({ brandName: e.target.value });
                    triggerSaveNotification();
                  }}
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Enter Brand Name"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Brand Tagline & Slogan</label>
                <input
                  type="text"
                  value={brandConfig.brandTagline}
                  onChange={(e) => {
                    updateBrandConfig({ brandTagline: e.target.value });
                    triggerSaveNotification();
                  }}
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Enter Slogan"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Form Header Text</label>
                <input
                  type="text"
                  value={brandConfig.welcomeHeader}
                  onChange={(e) => {
                    updateBrandConfig({ welcomeHeader: e.target.value });
                    triggerSaveNotification();
                  }}
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white font-semibold text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  placeholder="Enter Title Header"
                />
              </div>
            </div>
          </div>

          {/* Presentational Layout styles */}
          <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-slate-850 text-left">
            <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider font-mono flex items-center gap-2">
              <Layout className="w-4 h-4" />
              2. Presentational Layout Options
            </h4>
            
            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  updateBrandConfig({ layoutStyle: 'split' });
                  triggerSaveNotification();
                }}
                className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  brandConfig.layoutStyle === 'split' 
                    ? 'border-indigo-500 bg-indigo-950/40 text-white' 
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white'
                }`}
              >
                <Layout className="w-4 h-4 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-wider">Split Cover</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateBrandConfig({ layoutStyle: 'backdrop' });
                  triggerSaveNotification();
                }}
                className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  brandConfig.layoutStyle === 'backdrop' 
                    ? 'border-indigo-500 bg-indigo-950/40 text-white' 
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-4 h-4 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-wider">Wallpaper</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateBrandConfig({ layoutStyle: 'compact' });
                  triggerSaveNotification();
                }}
                className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  brandConfig.layoutStyle === 'compact' 
                    ? 'border-indigo-500 bg-indigo-950/40 text-white' 
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-4 h-4 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-wider">Compact Header</span>
              </button>
            </div>
          </div>

          {/* Intensity of dark overlay filter */}
          <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-slate-850 text-left">
            <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider font-mono flex items-center gap-2">
              <Eye className="w-4 h-4" />
              3. Image Overlay Darkness Factor
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-slate-400">
                 <span>Brighter image (0%)</span>
                 <span className="text-indigo-400 font-mono font-bold">{brandConfig.overlayOpacity}%</span>
                 <span>Darker overlay (95%)</span>
              </div>
              <input
                type="range"
                min="0"
                max="95"
                value={brandConfig.overlayOpacity}
                onChange={(e) => {
                  updateBrandConfig({ overlayOpacity: Number(e.target.value) });
                  triggerSaveNotification();
                }}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <p className="text-[9px] text-slate-500 leading-normal">Adjust overlay opacity to make text legible against high-intensity brand images.</p>
            </div>
          </div>
        </div>

        {/* Right Side: Logo Emblem Selection & Pictures Wallpapers */}
        <div className="space-y-6">
          {/* Logo Emblem Type */}
          <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-slate-850 text-left">
            <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider font-mono flex items-center gap-2">
              <Palette className="w-4 h-4" />
              4. Brand Logo Emblem Mode
            </h4>
            
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  updateBrandConfig({ logoType: 'fruits_flowers' });
                  triggerSaveNotification();
                }}
                className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-1.5 ${
                  (brandConfig.logoType || 'fruits_flowers') === 'fruits_flowers' 
                    ? 'border-indigo-500 bg-indigo-950/40 text-white' 
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white'
                }`}
              >
                <div className="w-8 h-8 flex items-center justify-center overflow-hidden">
                  <FruitsFlowersLogo size="100%" />
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider">Fruits n Flowers</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateBrandConfig({ logoType: 'apps_grid' });
                  triggerSaveNotification();
                }}
                className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  brandConfig.logoType === 'apps_grid' 
                    ? 'border-indigo-500 bg-indigo-950/40 text-white' 
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white'
                }`}
              >
                <Layout className="w-5 h-5 text-indigo-400" />
                <span className="text-[9px] font-black uppercase tracking-wider">Apps Grid Icon</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateBrandConfig({ logoType: 'initial' });
                  triggerSaveNotification();
                }}
                className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  brandConfig.logoType === 'initial' 
                    ? 'border-indigo-500 bg-indigo-950/40 text-white' 
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white'
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center text-indigo-450 text-[12px] font-extrabold bg-transparent">
                  {brandConfig.brandName?.[0] || 'F'}
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider">Name Initial</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  updateBrandConfig({ logoType: 'custom_url' });
                  triggerSaveNotification();
                }}
                className={`p-3 rounded-xl border text-center transition cursor-pointer flex flex-col items-center justify-center gap-2 ${
                  brandConfig.logoType === 'custom_url' 
                    ? 'border-indigo-500 bg-indigo-950/40 text-white' 
                    : 'border-slate-800 bg-slate-900/50 text-slate-400 hover:text-white'
                }`}
              >
                <Upload className="w-5 h-5 text-teal-405 text-teal-400" />
                <span className="text-[9px] font-black uppercase tracking-wider">Uploaded Logo</span>
              </button>
            </div>

            {brandConfig.logoType === 'custom_url' && (
              <div className="space-y-2 pt-2 border-t border-slate-900 animate-fadeIn">
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Local Logo Upload</label>
                <div className="flex flex-col gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
                  
                  {brandConfig.logoUrl ? (
                    <div className="flex items-center gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                      <img 
                        src={brandConfig.logoUrl} 
                        alt="Current Logo" 
                        className="w-10 h-10 object-contain rounded"
                        referrerPolicy="no-referrer"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">Active Custom Logo</p>
                        <p className="text-[8px] text-emerald-400 font-medium">Successfully Configured</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-2 text-[10px] text-slate-500 italic">No logo uploaded yet</div>
                  )}

                  <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-800/50">
                    <span className="text-[9px] text-slate-400 font-medium">Select Image File:</span>
                    <button
                      type="button"
                      onClick={() => document.getElementById('brand-logo-local-file-picker')?.click()}
                      className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1 shadow"
                    >
                      <Upload className="w-3 h-3" />
                      Browse Folder
                    </button>
                    <input
                      type="file"
                      id="brand-logo-local-file-picker"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const file = e.target.files[0];
                          if (!file.type.startsWith('image/')) return;
                          uploadFileToStorage(file, `attachments/brand/logo-${Date.now()}`).then(({ downloadUrl }) => {
                            updateBrandConfig({ logoUrl: downloadUrl, logoType: 'custom_url' });
                            triggerSaveNotification();
                          }).catch(() => alert('Failed to upload brand logo.'));
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Brand Pictures presets */}
          <div className="space-y-4 bg-slate-950 p-5 rounded-2xl border border-slate-850 text-left" id="brand-pictures-preset-wrapper">
            <h4 className="text-xs font-black uppercase text-indigo-400 tracking-wider font-mono flex items-center gap-2">
              <ImageIcon className="w-4 h-4" />
              5. Select Brand Picture/Wallpaper Option
            </h4>
            
            <div className="grid grid-cols-2 gap-2.5 max-h-[180px] overflow-y-auto pr-1">
              {allWallpapers.map((p) => {
                const active = brandConfig.imageUrl === p.url;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      const isCustom = customWallpapers.some(cw => cw.url === p.url);
                      updateBrandConfig({ imageUrl: p.url, imageType: isCustom ? 'uploaded' : 'preset' });
                      triggerSaveNotification();
                    }}
                    className={`group relative rounded-xl overflow-hidden h-20 border transition text-left cursor-pointer ${
                      active ? 'ring-2 ring-indigo-500 border-indigo-400' : 'border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <img 
                      src={p.url} 
                      alt={p.name} 
                      className="w-full h-full object-cover transition duration-300 group-hover:scale-105" 
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent flex flex-col justify-end p-2 pb-1.5">
                      <span className="text-[9px] font-bold text-white tracking-wide truncate">{p.name}</span>
                    </div>
                    {active && (
                      <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-indigo-600 rounded-full flex items-center justify-center border border-white z-10">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="w-full h-[1px] bg-slate-900 my-1" />

            {/* Provide custom URL */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Or Paste Custom Image URL</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customUrlInput}
                  onChange={(e) => setCustomUrlInput(e.target.value)}
                  className="flex-1 p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-white text-[11px] focus:ring-1 focus:ring-indigo-500 focus:outline-none placeholder-slate-700"
                  placeholder="https://images.unsplash.com/your-custom-image-url..."
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customUrlInput.trim()) {
                      const url = customUrlInput.trim();
                      const existsStatus = customWallpapers.some(cw => cw.url === url) || BRAND_PRESETS.some(bp => bp.url === url);
                      if (!existsStatus) {
                        const newCustomWall = {
                          id: `custom_${Date.now()}`,
                          name: 'Pasted Custom URL',
                          url: url,
                          description: 'Custom brand image via URL.'
                        };
                        const updatedCustoms = [...customWallpapers, newCustomWall].slice(-2);
                        setCustomWallpapers(updatedCustoms);
                      }
                      updateBrandConfig({ imageUrl: url, imageType: 'custom_url' });
                      triggerSaveNotification();
                    }
                  }}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl uppercase tracking-wider text-[9px] transition cursor-pointer shrink-0"
                >
                  Apply
                </button>
              </div>
            </div>

            <div className="w-full h-[1px] bg-slate-900 my-1" />

            {/* Upload customized file option */}
            <div className="space-y-1.5">
              <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider">Or Upload Custom Brand Image</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => document.getElementById('brand-config-upload-file')?.click()}
                  className="flex-1 border border-dashed border-slate-700 hover:border-indigo-500 rounded-xl py-2 px-3 text-center cursor-pointer bg-slate-900/50 hover:bg-slate-900 transition flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="text-[10px] font-black uppercase text-slate-300">File Picker Upload</span>
                </button>
                <input
                  type="file"
                  id="brand-config-upload-file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      const file = e.target.files[0];
                      if (!file.type.startsWith('image/')) return;
                      uploadFileToStorage(file, `attachments/brand/image-${Date.now()}`).then(({ downloadUrl }) => {
                        const newCustomWall = {
                          id: `custom_${Date.now()}`,
                          name: file.name || `Uploaded Image ${customWallpapers.length + 1}`,
                          url: downloadUrl,
                          description: 'Uploaded custom brand asset.'
                        };
                        const updatedCustoms = [...customWallpapers, newCustomWall].slice(-2);
                        setCustomWallpapers(updatedCustoms);
                        updateBrandConfig({ imageUrl: downloadUrl, imageType: 'uploaded' });
                        triggerSaveNotification();
                      }).catch(() => alert('Failed to upload brand image.'));
                    }
                  }}
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Action Footer */}
      <div className="pt-5 border-t border-slate-800 flex justify-end gap-3.5">
        <button
          type="button"
          onClick={() => {
            updateBrandConfig(DEFAULT_BRAND_CONFIG);
            setCustomUrlInput('');
            triggerSaveNotification();
          }}
          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-850 text-slate-300 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition cursor-pointer"
        >
          Reset Default Visuals
        </button>
      </div>
    </div>
  );
}
