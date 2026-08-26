import React, { useState } from 'react';
import { useCRM } from '../store';
import { 
  Influencer, InfluencerCampaign, InfluencerCollaboration, 
  InfluencerDispatch, InfluencerPayment, InfluencerContent 
} from '../types';
import { 
  Users, Award, DollarSign, Sparkles, Video, TrendingUp, Plus, Trash2, 
  Edit2, Target, Zap, Gift, Briefcase, FileText, CheckCircle2, AlertCircle, 
  Search, ShieldAlert, BarChart3, ChevronRight, MessageSquare, ArrowUpRight, Send,
  List, LayoutGrid
} from 'lucide-react';

const getSocialMediaUrl = (platform: string, handle: string) => {
  const cleanHandle = handle.trim().replace(/^@/, '');
  switch (platform) {
    case 'Instagram':
      return `https://instagram.com/${cleanHandle}`;
    case 'YouTube':
      return handle.startsWith('@') ? `https://youtube.com/${handle}` : `https://youtube.com/@${cleanHandle}`;
    case 'TikTok':
      return `https://tiktok.com/@${cleanHandle}`;
    case 'Facebook':
      return `https://facebook.com/${cleanHandle}`;
    case 'Twitter':
      return `https://twitter.com/${cleanHandle}`;
    default:
      return `https://google.com/search?q=${encodeURIComponent(handle)}`;
  }
};

const renderMessageTextWithImages = (text: string, attachedImageUrl?: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/gi;
  const parts = text.split(urlRegex);
  
  return (
    <div className="space-y-2 break-words">
      <div className="whitespace-pre-wrap leading-relaxed text-xs">
        {parts.map((part, i) => {
          if (part.match(urlRegex)) {
            const cleanUrl = part.trim();
            const isImage = cleanUrl.match(/\.(jpeg|jpg|gif|png|webp)/i) !== null || 
                            cleanUrl.includes('images.unsplash.com') || 
                            cleanUrl.includes('images.pexels.com') ||
                            cleanUrl.includes('picsum.photos') ||
                            cleanUrl.includes('fbcdn.net') ||
                            cleanUrl.includes('instagram.com/p/');
            if (isImage) {
              return (
                <span key={i} className="block my-2">
                  <img 
                    src={cleanUrl} 
                    alt="Pasted attachment" 
                    referrerPolicy="no-referrer"
                    className="max-w-full max-h-48 rounded-lg object-cover border border-slate-800/40 shadow-sm" 
                  />
                  <a 
                    href={cleanUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[9px] text-indigo-400 hover:underline block mt-1"
                  >
                    Open Image ↗
                  </a>
                </span>
              );
            }
            return (
              <a 
                key={i} 
                href={cleanUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-indigo-400 hover:underline break-all font-semibold"
              >
                {cleanUrl}
              </a>
            );
          }
          return part;
        })}
      </div>
      {attachedImageUrl && (
        <div className="mt-2">
          <img 
            src={attachedImageUrl} 
            alt="Attached picture" 
            referrerPolicy="no-referrer"
            className="max-w-full max-h-48 rounded-lg object-cover border border-slate-800/40 shadow-sm" 
          />
        </div>
      )}
    </div>
  );
};

const PRESET_PORTRAITS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1489980508314-941910ded1f4?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1552058544-f2b08422138a?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1560250097-0b93528c311a?w=150&auto=format&fit=crop&q=80", // male
  "https://images.unsplash.com/photo-1548142813-c348350df52b?w=150&auto=format&fit=crop&q=80", // female
  "https://images.unsplash.com/photo-1513956589380-bad6acb9b9d4?w=150&auto=format&fit=crop&q=80"  // male
];

const isDirectImageUrl = (text: string): boolean => {
  const clean = text.trim().toLowerCase();
  if (!clean) return false;

  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    return false;
  }

  // Known CDN domains that host images (even if they contain social media brand names)
  const isCdnUrl = clean.includes('cdninstagram.com') ||
                   clean.includes('fbcdn.net') ||
                   clean.includes('ggpht.com') ||
                   clean.includes('googleusercontent.com') ||
                   clean.includes('twimg.com') ||
                   clean.includes('licdn.com') ||
                   clean.includes('unsplash.com') ||
                   clean.includes('pexels.com') ||
                   clean.includes('picsum.photos') ||
                   clean.includes('cloudinary.com') ||
                   clean.includes('akamaihd.net');

  if (isCdnUrl) return true;

  // Check file extensions (ignoring query parameters)
  const urlWithoutQuery = clean.split('?')[0];
  const hasImageExtension = urlWithoutQuery.endsWith('.jpg') || 
                            urlWithoutQuery.endsWith('.jpeg') || 
                            urlWithoutQuery.endsWith('.png') || 
                            urlWithoutQuery.endsWith('.webp') || 
                            urlWithoutQuery.endsWith('.gif') || 
                            urlWithoutQuery.endsWith('.svg') ||
                            urlWithoutQuery.endsWith('.bmp');

  if (hasImageExtension) return true;

  // If it's a direct profile page or video page, it's NOT a direct image
  const isSocialProfilePage = clean.includes('instagram.com/') || 
                              clean.includes('youtube.com/') || 
                              clean.includes('tiktok.com/') || 
                              clean.includes('facebook.com/') || 
                              clean.includes('twitter.com/') || 
                              clean.includes('x.com/');

  // If it's a URL but not a social profile page, treat it as a direct image URL to avoid blocking custom websites/CDNs
  if (!isSocialProfilePage) {
    return true;
  }

  return false;
};

const resizeImageToProfileSize = (url: string): string => {
  const clean = url.trim();
  if (!clean) return '';

  try {
    // If it's an Unsplash URL, replace width and height with 150x150 face crop for optimal profile preview
    if (clean.includes('unsplash.com')) {
      const baseUrl = clean.split('?')[0];
      const params = new URLSearchParams(clean.includes('?') ? clean.split('?')[1] : '');
      params.set('w', '150');
      params.set('h', '150');
      params.set('fit', 'crop');
      params.set('crop', 'faces');
      params.set('q', '80');
      params.set('auto', 'format');
      return `${baseUrl}?${params.toString()}`;
    }

    // If it's a Pexels URL, resize to 150x150
    if (clean.includes('pexels.com')) {
      const baseUrl = clean.split('?')[0];
      const params = new URLSearchParams(clean.includes('?') ? clean.split('?')[1] : '');
      params.set('w', '150');
      params.set('h', '150');
      params.set('fit', 'crop');
      return `${baseUrl}?${params.toString()}`;
    }

    // If it's a Google User Content URL, resize to 150px
    if (clean.includes('googleusercontent.com')) {
      const baseUrl = clean.split('=')[0];
      return `${baseUrl}=s150-c`;
    }
  } catch (e) {
    console.error("Error resizing avatar URL:", e);
  }

  return clean;
};

const getDeterministicAvatar = (handle: string) => {
  const clean = handle.trim().toLowerCase().replace(/^@/, '');
  if (!clean) return PRESET_PORTRAITS[0];
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PRESET_PORTRAITS.length;
  return PRESET_PORTRAITS[index];
};

const parseSocialLinkOrHandle = (input: string): { handle: string; platform?: 'Instagram' | 'YouTube' | 'TikTok' | 'Facebook' } => {
  let text = input.trim();
  if (!text) return { handle: '' };

  // If it's a URL, parse it
  if (text.includes('instagram.com/')) {
    const parts = text.split('instagram.com/');
    const handlePart = parts[1]?.split(/[?#]/)[0]?.replace(/\/$/, '') || '';
    return { handle: `@${handlePart}`, platform: 'Instagram' };
  }
  if (text.includes('youtube.com/')) {
    const parts = text.split('youtube.com/');
    const handlePart = parts[1]?.split(/[?#]/)[0]?.replace(/\/$/, '') || '';
    const cleanPart = handlePart.replace(/^\@/, '');
    return { handle: `@${cleanPart}`, platform: 'YouTube' };
  }
  if (text.includes('tiktok.com/')) {
    const parts = text.split('tiktok.com/');
    const handlePart = parts[1]?.split(/[?#]/)[0]?.replace(/\/$/, '') || '';
    const cleanPart = handlePart.replace(/^\@/, '');
    return { handle: `@${cleanPart}`, platform: 'TikTok' };
  }
  if (text.includes('facebook.com/')) {
    const parts = text.split('facebook.com/');
    const handlePart = parts[1]?.split(/[?#]/)[0]?.replace(/\/$/, '') || '';
    return { handle: `@${handlePart}`, platform: 'Facebook' };
  }

  // If handle starts with @ or is a plain string
  const clean = text.replace(/^\@/, '');
  return { handle: `@${clean}` };
};

export default function InfluencerMarketingView() {
  const { 
    currentUser, hasAccess, products, salesOrders,
    influencers, addInfluencer, updateInfluencer, deleteInfluencer,
    influencerCampaigns, addInfluencerCampaign, updateInfluencerCampaign, deleteInfluencerCampaign,
    influencerCollaborations, addInfluencerCollaboration, updateInfluencerCollaboration, deleteInfluencerCollaboration,
    influencerDispatches, addInfluencerDispatch, updateInfluencerDispatch, deleteInfluencerDispatch,
    influencerPayments, addInfluencerPayment, updateInfluencerPayment, deleteInfluencerPayment,
    influencerContents, addInfluencerContent, updateInfluencerContent, deleteInfluencerContent
  } = useCRM();

  // Primary navigation tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'influencers' | 'campaigns' | 'logistics'>('dashboard');

  // Modal and form states
  const [showAddInfluencer, setShowAddInfluencer] = useState(false);
  const [showAddCampaign, setShowAddCampaign] = useState(false);
  const [showAddCollaboration, setShowAddCollaboration] = useState(false);
  const [showAddDispatch, setShowAddDispatch] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [showAddContent, setShowAddContent] = useState(false);

  // Search and filters
  const [influencerSearch, setInfluencerSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState('All');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // AI Feature States
  const [aiAction, setAiAction] = useState<'recommend_influencers' | 'write_brief' | 'generate_captions'>('recommend_influencers');
  const [aiProduct, setAiProduct] = useState('');
  const [aiGoal, setAiGoal] = useState('');
  const [aiCampaignName, setAiCampaignName] = useState('');
  const [aiCaptionTone, setAiCaptionTone] = useState('creative');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Workflow Automation state
  const [automationRules, setAutomationRules] = useState<Array<{ id: string; trigger: string; action: string; active: boolean }>>([
    { id: 'rule-1', trigger: 'Product Dispatched but Content not live within 7 days', action: 'Send reminder WhatsApp template to Influencer', active: true },
    { id: 'rule-2', trigger: 'Content view count exceeds 10,000 views', action: 'Auto-approve sponsorship bonus payout', active: true },
    { id: 'rule-3', trigger: 'Sponsorship Payment Status changed to Paid', action: 'Generate and send official GST confirmation invoice', active: false }
  ]);
  const [newRuleTrigger, setNewRuleTrigger] = useState('');
  const [newRuleAction, setNewRuleAction] = useState('');

  // Form Fields State
  const [newInfluencer, setNewInfluencer] = useState<Partial<Influencer>>({
    name: '', handle: '', platform: 'Instagram', followers: 50000, niche: '', email: '', phone: '',
    mobileNumber: '', whatsappNumber: '', contactNumber: '', gpayNumber: '',
    ratingScore: 80, notes: '', referralCode: '',
    instagramHandle: '', facebook: '', youtube: '', engagementPercent: 0,
    state: '', district: '', city: '', pincode: '', language: '', category: '',
    whatsappMobile: '', amazonWishlist: '', upi: '', collaborationType: 'Paid',
    productSent: 'No', payment: 'Pending', campaign: '', reelLink: '', storyLink: '',
    couponCode: '', salesGenerated: 0, leads: 0, roi: 0, status: 'Active'
  });
  const [editingInfluencer, setEditingInfluencer] = useState<Influencer | null>(null);
  const [newCampaign, setNewCampaign] = useState<Partial<InfluencerCampaign>>({
    name: '', status: 'Active', budget: 100000, startDate: new Date().toISOString().split('T')[0], endDate: '', targetProductIds: [], goal: '', advertisingCost: 0, otherExpenses: 0
  });
  const [newCollaboration, setNewCollaboration] = useState<Partial<InfluencerCollaboration>>({
    campaignId: '', influencerId: '', status: 'Proposed', agreedFee: 10000, notes: ''
  });
  const [newDispatch, setNewDispatch] = useState<Partial<InfluencerDispatch>>({
    collaborationId: '', productId: '', productCost: 500, shippingCost: 100, dispatchType: 'Free Sample', reimbursementAmount: 0, trackingNumber: '', dispatchDate: new Date().toISOString().split('T')[0], deliveryStatus: 'Pending'
  });
  const [newPayment, setNewPayment] = useState<Partial<InfluencerPayment>>({
    collaborationId: '', amount: 10000, paymentDate: new Date().toISOString().split('T')[0], paymentMethod: 'UPI', status: 'Pending', referenceNumber: ''
  });
  const [newContent, setNewContent] = useState<Partial<InfluencerContent>>({
    collaborationId: '', deliverableType: 'Reel', link: '', liveDate: '', status: 'Pending Draft', views: 0, likes: 0, comments: 0
  });

  // Chat Integration States
  const [activeChatInfluencer, setActiveChatInfluencer] = useState<Influencer | null>(null);
  const [chatMessageText, setChatMessageText] = useState('');
  const [chatSender, setChatSender] = useState<'user' | 'influencer'>('user');
  const [chatImageUrl, setChatImageUrl] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Access Checks
  const canEdit = hasAccess('Marketing', 'edit') || currentUser?.role === 'Admin';
  const canCreate = hasAccess('Marketing', 'create') || currentUser?.role === 'Admin';

  // --- ROI ENGINE & CALCULATIONS ---
  // Calculates investment & retrieve real-time revenue from existing salesOrders without duplications
  const getCampaignMetrics = (campaign: InfluencerCampaign) => {
    // Find all collaborations under this campaign
    const collabs = influencerCollaborations.filter(c => c.campaignId === campaign.id);
    const collabIds = collabs.map(c => c.id);

    // Sum agreed fees
    const servicePaymentsTotal = influencerPayments
      .filter(p => collabIds.includes(p.collaborationId) && p.status === 'Paid')
      .reduce((sum, p) => sum + p.amount, 0);

    // Sum product dispatches (product cost, shipping cost, reimbursement amount)
    const dispatches = influencerDispatches.filter(d => collabIds.includes(d.collaborationId));
    const productCostTotal = dispatches.reduce((sum, d) => sum + d.productCost, 0);
    const shippingCostTotal = dispatches.reduce((sum, d) => sum + d.shippingCost, 0);
    const reimbursementTotal = dispatches.reduce((sum, d) => sum + d.reimbursementAmount, 0);

    // Total Investment = Product Cost + Shipping Cost + Amazon Reimbursement + Service Payment + Advertising + Other expenses
    const totalInvestment = productCostTotal + shippingCostTotal + reimbursementTotal + 
                            servicePaymentsTotal + campaign.advertisingCost + campaign.otherExpenses;

    // Retrieve revenue dynamically from existing Sales/ERP system.
    // We match SalesOrders by Campaign ID, influencer's referral code, or referral partner links
    const associatedInfluencerIds = collabs.map(c => c.influencerId);
    const associatedInfluencers = influencers.filter(i => associatedInfluencerIds.includes(i.id));
    const referralCodes = associatedInfluencers.map(i => i.referralCode?.trim().toUpperCase()).filter(Boolean);

    // Filter sales orders matching referral code or campaign id
    const matchingOrders = salesOrders.filter(order => {
      if (order.deliveryStatus === 'Cancelled') return false;
      const code = (order.referralCode || '').trim().toUpperCase();
      if (!code) return false;
      
      // Match campaign id or code, or matching influencer referral code
      return code === campaign.id.toUpperCase() || 
             code === campaign.name.toUpperCase() || 
             referralCodes.includes(code);
    });

    const totalRevenue = matchingOrders.reduce((sum, order) => sum + order.totalValue, 0);

    // ROI (%) = ((Revenue − Total Investment) ÷ Total Investment) × 100
    const roi = totalInvestment > 0 ? ((totalRevenue - totalInvestment) / totalInvestment) * 100 : 0;

    return {
      collabsCount: collabs.length,
      productCostTotal,
      shippingCostTotal,
      reimbursementTotal,
      servicePaymentsTotal,
      totalInvestment,
      totalRevenue,
      roi,
      salesCount: matchingOrders.length
    };
  };

  // Calculates Influencer Performance Score (composite metric between 1 and 100)
  const getInfluencerPerformanceScore = (influencer: Influencer) => {
    // Find all collaborations and deliverables for this influencer
    const collabs = influencerCollaborations.filter(c => c.influencerId === influencer.id);
    const collabIds = collabs.map(c => c.id);
    const deliverables = influencerContents.filter(content => collabIds.includes(content.collaborationId));

    const totalViews = deliverables.reduce((sum, d) => sum + d.views, 0);
    const totalLikes = deliverables.reduce((sum, d) => sum + d.likes, 0);
    const totalComments = deliverables.reduce((sum, d) => sum + d.comments, 0);
    
    // Average Engagement Rate
    const totalEngagements = totalLikes + totalComments;
    const avgEngagement = totalViews > 0 ? (totalEngagements / totalViews) * 100 : 0;

    // Leads generated by influencer
    const leadsGenerated = influencer.leads || 0;

    // Sales generated from ERP
    const matchingOrders = salesOrders.filter(order => 
      order.deliveryStatus !== 'Cancelled' && 
      order.referralCode?.toUpperCase() === influencer.referralCode?.toUpperCase()
    );
    const salesCount = matchingOrders.length;

    // Scoring weights:
    // 1. Views Score: max 30 points (based on 20k views target)
    const viewsScore = Math.min((totalViews / 20000) * 30, 30);
    // 2. Engagement Score: max 25 points (based on 5% engagement target)
    const engagementScore = Math.min((avgEngagement / 5) * 25, 25);
    // 3. Leads Score: max 20 points (based on 10 leads target)
    const leadsScore = Math.min((leadsGenerated / 10) * 20, 20);
    // 4. Sales/ROI Score: max 25 points (based on 5 sales target)
    const salesScore = Math.min((salesCount / 5) * 25, 25);

    // Combine with inherent rating score from previous campaign history
    const calculatedScore = Math.round(viewsScore + engagementScore + leadsScore + salesScore);
    return calculatedScore > 0 ? calculatedScore : influencer.ratingScore || 50;
  };

  // --- GEMINI AI SERVICES HANDLER ---
  const handleAIRequest = async () => {
    setAiLoading(true);
    setAiResult('');
    try {
      const response = await fetch('/api/influencer-ai-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: aiAction,
          productName: aiProduct || (products[0]?.name || 'Premium Herbal Health Suite'),
          campaignGoal: aiGoal || 'Boost brand awareness and generate qualified leads with reels',
          influencers: influencers.map(i => ({ id: i.id, name: i.name, platform: i.platform, followers: i.followers, niche: i.niche, score: getInfluencerPerformanceScore(i) })),
          campaignName: aiCampaignName,
          captionTone: aiCaptionTone
        })
      });
      const data = await response.json();
      if (data.success) {
        setAiResult(data.result);
      } else {
        setAiResult('Error running AI assistant model.');
      }
    } catch (e) {
      setAiResult('Connection error with the server-side AI model.');
    } finally {
      setAiLoading(false);
    }
  };

  // Handle addition helpers
  const handleAutoFetchNewAvatar = () => {
    let pastedValue = (newInfluencer.avatarUrl || '').trim();
    let activeHandle = (newInfluencer.handle || '').trim();

    // If the pasted value or handle is already a direct image URL, preserve, resize, and use it as-is!
    if (isDirectImageUrl(pastedValue)) {
      setNewInfluencer({ ...newInfluencer, avatarUrl: resizeImageToProfileSize(pastedValue) });
      return;
    }
    if (isDirectImageUrl(activeHandle)) {
      setNewInfluencer({ ...newInfluencer, avatarUrl: resizeImageToProfileSize(activeHandle), handle: '' });
      return;
    }

    // Otherwise, inspect the pasted text (either in avatarUrl or handle field) for a social handle/profile link
    let sourceText = pastedValue || activeHandle;
    if (sourceText.includes('/') || sourceText.includes('.')) {
      const parsed = parseSocialLinkOrHandle(sourceText);
      const updated: any = { ...newInfluencer, handle: parsed.handle };
      if (parsed.platform) {
        updated.platform = parsed.platform;
      }
      updated.avatarUrl = getDeterministicAvatar(parsed.handle);
      setNewInfluencer(updated);
    } else {
      const avatar = getDeterministicAvatar(sourceText);
      setNewInfluencer({ 
        ...newInfluencer, 
        handle: sourceText ? `@${sourceText.replace(/^\@/, '')}` : newInfluencer.handle, 
        avatarUrl: avatar 
      });
    }
  };

  const handleAutoFetchEditAvatar = () => {
    if (!editingInfluencer) return;
    let pastedValue = (editingInfluencer.avatarUrl || '').trim();
    let activeHandle = (editingInfluencer.handle || '').trim();

    // If the pasted value or handle is already a direct image URL, preserve, resize, and use it as-is!
    if (isDirectImageUrl(pastedValue)) {
      setEditingInfluencer({ ...editingInfluencer, avatarUrl: resizeImageToProfileSize(pastedValue) });
      return;
    }
    if (isDirectImageUrl(activeHandle)) {
      setEditingInfluencer({ ...editingInfluencer, avatarUrl: resizeImageToProfileSize(activeHandle), handle: '' });
      return;
    }

    // Inspect either field for a social link or handle
    let sourceText = pastedValue || activeHandle;
    if (sourceText.includes('/') || sourceText.includes('.')) {
      const parsed = parseSocialLinkOrHandle(sourceText);
      const updated: Influencer = { ...editingInfluencer, handle: parsed.handle };
      if (parsed.platform) {
        updated.platform = parsed.platform;
      }
      updated.avatarUrl = getDeterministicAvatar(parsed.handle);
      setEditingInfluencer(updated);
    } else {
      const avatar = getDeterministicAvatar(sourceText);
      setEditingInfluencer({ 
        ...editingInfluencer, 
        handle: sourceText ? `@${sourceText.replace(/^\@/, '')}` : editingInfluencer.handle, 
        avatarUrl: avatar 
      });
    }
  };

  const handleOpenAddModal = () => {
    const randomId = `INF-${Math.floor(1000 + Math.random() * 9000)}`;
    setNewInfluencer({
      name: '', handle: '', platform: 'Instagram', followers: 25000, niche: '', email: '', phone: '',
      mobileNumber: '', whatsappNumber: '', contactNumber: '', gpayNumber: '',
      ratingScore: 80, notes: '', referralCode: `REF-${Math.floor(100 + Math.random() * 900)}`,
      influencerId: randomId, instagramHandle: '', facebook: '', youtube: '', engagementPercent: 4.5,
      state: '', district: '', city: '', pincode: '', language: 'English', category: '',
      whatsappMobile: '', amazonWishlist: '', upi: '', collaborationType: 'Paid',
      productSent: 'No', payment: 'Pending', campaign: '', reelLink: '', storyLink: '',
      couponCode: `SAVE-${Math.floor(10 + Math.random() * 90)}`, salesGenerated: 0, leads: 0, roi: 0, status: 'Active'
    });
    setShowAddInfluencer(true);
  };

  const handleCreateInfluencer = (e: React.FormEvent) => {
    e.preventDefault();
    let finalAvatar = newInfluencer.avatarUrl?.trim();
    
    if (finalAvatar && isDirectImageUrl(finalAvatar)) {
      finalAvatar = resizeImageToProfileSize(finalAvatar);
    } else if (!finalAvatar || (!isDirectImageUrl(finalAvatar) && (finalAvatar.includes('instagram.com') || finalAvatar.includes('youtube.com') || finalAvatar.includes('tiktok.com') || finalAvatar.includes('facebook.com')))) {
      // Generate fallback based on the handle
      finalAvatar = getDeterministicAvatar(newInfluencer.handle || '');
    }

    const finalItem = {
      ...newInfluencer,
      avatarUrl: finalAvatar
    };
    addInfluencer(finalItem as any);
    setShowAddInfluencer(false);
    setNewInfluencer({
      name: '', handle: '', platform: 'Instagram', followers: 50000, niche: '', email: '', phone: '',
      mobileNumber: '', whatsappNumber: '', contactNumber: '', gpayNumber: '',
      ratingScore: 80, notes: '', referralCode: '',
      instagramHandle: '', facebook: '', youtube: '', engagementPercent: 0,
      state: '', district: '', city: '', pincode: '', language: '', category: '',
      whatsappMobile: '', amazonWishlist: '', upi: '', collaborationType: 'Paid',
      productSent: 'No', payment: 'Pending', campaign: '', reelLink: '', storyLink: '',
      couponCode: '', salesGenerated: 0, leads: 0, roi: 0, status: 'Active'
    });
  };

  const handleUpdateInfluencer = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingInfluencer) {
      let finalAvatar = editingInfluencer.avatarUrl?.trim();

      if (finalAvatar && isDirectImageUrl(finalAvatar)) {
        finalAvatar = resizeImageToProfileSize(finalAvatar);
      } else if (!finalAvatar || (!isDirectImageUrl(finalAvatar) && (finalAvatar.includes('instagram.com') || finalAvatar.includes('youtube.com') || finalAvatar.includes('tiktok.com') || finalAvatar.includes('facebook.com')))) {
        // Generate fallback based on the handle
        finalAvatar = getDeterministicAvatar(editingInfluencer.handle || '');
      }

      const finalItem = {
        ...editingInfluencer,
        avatarUrl: finalAvatar
      };
      updateInfluencer(editingInfluencer.id, finalItem);
      setEditingInfluencer(null);
    }
  };

  const handleOpenChat = (inf: Influencer) => {
    setActiveChatInfluencer(inf);
    setChatMessageText('');
    setChatImageUrl('');
    setChatSender('user');
    setIsTyping(false);
  };

  const handleSendChatMessage = (textToSend?: string, senderToUse?: 'user' | 'influencer', customImageUrl?: string) => {
    const text = (textToSend !== undefined ? textToSend : chatMessageText).trim();
    const activeSender = senderToUse || chatSender;
    const attachedImg = customImageUrl !== undefined ? customImageUrl : chatImageUrl;
    
    if (!text && !attachedImg) return;

    const newMsg = {
      id: `msg-${Date.now()}`,
      sender: activeSender,
      text,
      timestamp: new Date().toISOString(),
      imageUrl: attachedImg || undefined
    };

    const currentHistory = activeChatInfluencer?.chatHistory || [];
    const updatedHistory = [...currentHistory, newMsg];
    
    if (activeChatInfluencer) {
      const updatedInfluencer = {
        ...activeChatInfluencer,
        chatHistory: updatedHistory
      };
      setActiveChatInfluencer(updatedInfluencer);
      updateInfluencer(activeChatInfluencer.id, updatedInfluencer);
    }
    
    setChatMessageText('');
    setChatImageUrl('');
  };

  const handleClearChatHistory = () => {
    if (!activeChatInfluencer) return;
    if (confirm("Are you sure you want to clear all chat history for this influencer?")) {
      const updatedInfluencer = {
        ...activeChatInfluencer,
        chatHistory: []
      };
      setActiveChatInfluencer(updatedInfluencer);
      updateInfluencer(activeChatInfluencer.id, updatedInfluencer);
    }
  };

  const handleCreateCampaign = (e: React.FormEvent) => {
    e.preventDefault();
    addInfluencerCampaign(newCampaign as any);
    setShowAddCampaign(false);
    setNewCampaign({ name: '', status: 'Active', budget: 100000, startDate: new Date().toISOString().split('T')[0], endDate: '', targetProductIds: [], goal: '', advertisingCost: 0, otherExpenses: 0 });
  };

  const handleCreateCollaboration = (e: React.FormEvent) => {
    e.preventDefault();
    addInfluencerCollaboration(newCollaboration as any);
    setShowAddCollaboration(false);
  };

  const handleCreateDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    addInfluencerDispatch(newDispatch as any);
    setShowAddDispatch(false);
  };

  const handleCreatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    addInfluencerPayment(newPayment as any);
    setShowAddPayment(false);
  };

  const handleCreateContent = (e: React.FormEvent) => {
    e.preventDefault();
    addInfluencerContent(newContent as any);
    setShowAddContent(false);
  };

  const handleAddAutomationRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleTrigger || !newRuleAction) return;
    setAutomationRules(prev => [...prev, { id: `rule-${Date.now()}`, trigger: newRuleTrigger, action: newRuleAction, active: true }]);
    setNewRuleTrigger('');
    setNewRuleAction('');
  };

  // Total investment & Revenue metrics for all campaigns combined
  const overallSpent = influencerCampaigns.reduce((sum, camp) => sum + getCampaignMetrics(camp).totalInvestment, 0);
  const overallRevenue = influencerCampaigns.reduce((sum, camp) => sum + getCampaignMetrics(camp).totalRevenue, 0);
  const overallRoi = overallSpent > 0 ? ((overallRevenue - overallSpent) / overallSpent) * 100 : 0;

  // Filtered influencers list
  const filteredInfluencers = influencers.filter(inf => {
    const matchesSearch = inf.name.toLowerCase().includes(influencerSearch.toLowerCase()) || 
                          inf.handle.toLowerCase().includes(influencerSearch.toLowerCase()) || 
                          inf.niche.toLowerCase().includes(influencerSearch.toLowerCase());
    const matchesPlatform = platformFilter === 'All' || inf.platform === platformFilter;
    return matchesSearch && matchesPlatform;
  });

  return (
    <div className="space-y-6 text-slate-100" id="influencer-marketing-panel">
      {/* Upper Module Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5.5 h-5.5 text-pink-400" />
            Influencer Marketing & ROI Suite
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Track collaborations, dispatches, paid fixed sponsorship fees, content deliverables, and true ERP-synced ROI metrics.
          </p>
        </div>

        {/* Primary Sub Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/60 p-1 rounded-xl border border-slate-800/80">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Intelligence Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('influencers')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'influencers' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <Users className="w-3.5 h-3.5" />
            Influencer Directory
          </button>
          <button 
            onClick={() => setActiveTab('campaigns')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'campaigns' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <Target className="w-3.5 h-3.5" />
            Campaigns & Briefs
          </button>
          <button 
            onClick={() => setActiveTab('logistics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${activeTab === 'logistics' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
          >
            <Gift className="w-3.5 h-3.5" />
            Logistics & Content
          </button>
        </div>
      </div>

      {/* ==================== 1. INTELLIGENCE DASHBOARD ==================== */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6 animate-fade-in" id="infl-tab-dashboard">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
              <div className="p-3 rounded-xl bg-pink-950/40 border border-pink-900/30 text-pink-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block">Total Influencers</span>
                <span className="text-xl font-black text-white">{influencers.length} cataloged</span>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/30 text-emerald-400">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block">Total Investment</span>
                <span className="text-xl font-black text-emerald-400">₹{overallSpent.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
              <div className="p-3 rounded-xl bg-indigo-950/40 border border-indigo-900/30 text-indigo-400">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block">True Synced Revenue</span>
                <span className="text-xl font-black text-indigo-400">₹{overallRevenue.toLocaleString()}</span>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-2xl flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-900/30 text-purple-400">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold block">Combined Campaign ROI</span>
                <span className={`text-xl font-black ${overallRoi >= 0 ? 'text-emerald-400' : 'text-rose-450'}`}>
                  {overallRoi.toFixed(1)}% ROI
                </span>
              </div>
            </div>
          </div>

          {/* ROI Analytics Table & Breakdown */}
          <div className="bg-slate-900/20 border border-slate-800/80 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-white text-sm">Campaign Investment vs Dynamic ERP Revenue Breakdown</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Calculates true live profit return utilizing actual sales ledger discount promo code transactions.</p>
              </div>
            </div>

            {influencerCampaigns.length === 0 ? (
              <div className="p-8 text-center bg-slate-900/30 rounded-xl text-slate-500 text-xs">
                No campaigns generated yet. Create one in the "Campaigns & Briefs" tab to run ROI analysis.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 text-[10px] uppercase tracking-wider">
                      <th className="py-3 px-2">Campaign Name</th>
                      <th className="py-3 px-2">Total Investment Breakdown</th>
                      <th className="py-3 px-2 text-right">Service Payouts</th>
                      <th className="py-3 px-2 text-right">Logistics / Samples</th>
                      <th className="py-3 px-2 text-right text-white">Total Investment</th>
                      <th className="py-3 px-2 text-right text-indigo-300">Retrieved Revenue</th>
                      <th className="py-3 px-2 text-right">Orders Synced</th>
                      <th className="py-3 px-2 text-right text-emerald-400">ROI %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {influencerCampaigns.map(camp => {
                      const metrics = getCampaignMetrics(camp);
                      return (
                        <tr key={camp.id} className="hover:bg-slate-800/20">
                          <td className="py-3.5 px-2 font-bold text-white">
                            {camp.name}
                            <span className="block text-[9px] font-mono font-normal text-slate-400 mt-0.5 uppercase">ID: {camp.id} • Goal: {camp.goal}</span>
                          </td>
                          <td className="py-3.5 px-2">
                            <span className="text-[10px] text-slate-400 block font-mono">Ad Cost: ₹{camp.advertisingCost.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-400 block font-mono">Other: ₹{camp.otherExpenses.toLocaleString()}</span>
                          </td>
                          <td className="py-3.5 px-2 text-right font-mono text-slate-300">₹{metrics.servicePaymentsTotal.toLocaleString()}</td>
                          <td className="py-3.5 px-2 text-right font-mono text-slate-300">
                            ₹{(metrics.productCostTotal + metrics.shippingCostTotal + metrics.reimbursementTotal).toLocaleString()}
                          </td>
                          <td className="py-3.5 px-2 text-right font-mono font-bold text-white">₹{metrics.totalInvestment.toLocaleString()}</td>
                          <td className="py-3.5 px-2 text-right font-mono font-black text-indigo-400">₹{metrics.totalRevenue.toLocaleString()}</td>
                          <td className="py-3.5 px-2 text-right font-semibold text-slate-200">{metrics.salesCount} conversions</td>
                          <td className="py-3.5 px-2 text-right">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${metrics.roi >= 0 ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-900/40' : 'bg-rose-950/50 text-rose-450 border border-rose-900/40'}`}>
                              {metrics.roi.toFixed(1)}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Dual Column Layout: Performance Score & Automation */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Best Performing Influencers Score Board */}
            <div className="bg-slate-900/20 border border-slate-800 p-5 rounded-2xl">
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5 mb-3">
                <Award className="w-4 h-4 text-amber-400" />
                Influencer Performance Composite Score Board
              </h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Score indices (1-100) are dynamically recalculated based on actual video views, engagement ratios, leads created, and ROI.
              </p>

              {influencers.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  No influencers found. Add some to view active performance metrics.
                </div>
              ) : (
                <div className="space-y-3">
                  {influencers.slice(0, 5).map(inf => {
                    const score = getInfluencerPerformanceScore(inf);
                    return (
                      <div key={inf.id} className="bg-slate-900/50 border border-slate-800/55 rounded-xl p-3 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{inf.name}</span>
                            <span className="text-[10px] text-slate-400 font-mono">({inf.handle})</span>
                          </div>
                          <span className="text-[10px] text-indigo-400 mt-0.5 uppercase block font-mono">{inf.platform} • {inf.niche} • {inf.followers.toLocaleString()} followers</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold text-slate-500 font-mono">Performance Index</span>
                          <span className={`px-2.5 py-1 text-xs font-bold font-mono rounded-lg ${
                            score >= 80 ? 'bg-emerald-950 text-emerald-400 border border-emerald-900' :
                            score >= 50 ? 'bg-amber-950 text-amber-400 border border-amber-900' :
                            'bg-slate-800 text-slate-300'
                          }`}>
                            {score}/100
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Workflow Automations and Live Alarms */}
            <div className="bg-slate-900/20 border border-slate-800 p-5 rounded-2xl">
              <h3 className="font-bold text-white text-sm flex items-center gap-1.5 mb-3">
                <Zap className="w-4 h-4 text-indigo-400" />
                Workflow Automation Rules & Triggers
              </h3>
              <p className="text-[11px] text-slate-400 mb-4">
                Define real-time automation alerts for campaign milestone tracking.
              </p>

              <form onSubmit={handleAddAutomationRule} className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <input 
                  type="text" 
                  placeholder="Trigger scenario (e.g., Views exceed 10k)"
                  value={newRuleTrigger}
                  onChange={e => setNewRuleTrigger(e.target.value)}
                  className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white"
                />
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Action (e.g., Send WhatsApp)"
                    value={newRuleAction}
                    onChange={e => setNewRuleAction(e.target.value)}
                    className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white flex-1"
                  />
                  <button type="submit" className="px-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-white font-bold text-xs">
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {automationRules.map(rule => (
                  <div key={rule.id} className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-indigo-400 block tracking-wide">TRIGGER CONDITIONS</span>
                      <p className="text-xs text-white font-semibold mt-0.5">{rule.trigger}</p>
                      <span className="text-[10px] text-slate-400 block mt-1">⚡ AUTOMATED CONCEQUENCE: {rule.action}</span>
                    </div>
                    <button 
                      onClick={() => setAutomationRules(prev => prev.map(r => r.id === rule.id ? { ...r, active: !r.active } : r))}
                      className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${rule.active ? 'bg-emerald-950 text-emerald-400 border-emerald-900' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
                    >
                      {rule.active ? 'Active' : 'Disabled'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 2. INFLUENCER DIRECTORY ==================== */}
      {activeTab === 'influencers' && (
        <div className="space-y-6 animate-fade-in" id="infl-tab-influencers">
          {/* Filters and search block */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/30 p-4 border border-slate-800 rounded-2xl">
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="relative flex-1 md:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input 
                  type="text" 
                  placeholder="Search influencers handle, niche, name..."
                  value={influencerSearch}
                  onChange={e => setInfluencerSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-white w-full"
                />
              </div>

              <select 
                value={platformFilter}
                onChange={e => setPlatformFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300"
              >
                <option value="All">All Platforms</option>
                <option value="Instagram">Instagram</option>
                <option value="YouTube">YouTube</option>
                <option value="TikTok">TikTok</option>
                <option value="Facebook">Facebook</option>
              </select>

              <div className="flex bg-slate-950 border border-slate-800 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                    viewMode === 'table' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Table View"
                >
                  <List className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                    viewMode === 'cards' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
                  }`}
                  title="Card View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>
            </div>

            {canCreate && (
              <button 
                onClick={handleOpenAddModal}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer w-full md:w-auto justify-center"
              >
                <Plus className="w-4 h-4 text-white" />
                Add Influencer Profile
              </button>
            )}
          </div>

          {/* Form Modal for Creating Influencer */}
          {showAddInfluencer && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-lime-50 border border-lime-200 rounded-2xl p-6 max-w-4xl w-full space-y-4 shadow-xl my-8">
                <div className="flex items-center justify-between border-b border-lime-200 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">Register New Influencer</h3>
                    <p className="text-[11px] text-slate-600">Provide demographic, metric, social, contact, financial, and ROI data.</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setShowAddInfluencer(false)} 
                    className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleCreateInfluencer} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-h-[60vh] overflow-y-auto pr-2">
                    
                    {/* Column 1: Core Profile & Socials */}
                    <div className="space-y-4 bg-white/60 p-4 rounded-xl border border-lime-100">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1">1. Profile & Socials</h4>
                      
                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Influencer ID</label>
                        <input 
                          type="text" 
                          required
                          value={newInfluencer.influencerId || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, influencerId: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Name</label>
                        <input 
                          type="text" 
                          required
                          value={newInfluencer.name || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, name: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Primary Social Handle</label>
                        <input 
                          type="text" 
                          required
                          placeholder="@username"
                          value={newInfluencer.handle || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, handle: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Primary Platform</label>
                        <select 
                          value={newInfluencer.platform || 'Instagram'}
                          onChange={e => setNewInfluencer({...newInfluencer, platform: e.target.value as any})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="YouTube">YouTube</option>
                          <option value="TikTok">TikTok</option>
                          <option value="Facebook">Facebook</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Instagram Handle</label>
                        <input 
                          type="text" 
                          placeholder="@username"
                          value={newInfluencer.instagramHandle || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, instagramHandle: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Facebook Handle/Link</label>
                        <input 
                          type="text" 
                          placeholder="fb_user_or_link"
                          value={newInfluencer.facebook || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, facebook: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">YouTube Handle/Link</label>
                        <input 
                          type="text" 
                          placeholder="yt_channel_or_link"
                          value={newInfluencer.youtube || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, youtube: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>
                    </div>

                    {/* Column 2: Metrics, Category & Location */}
                    <div className="space-y-4 bg-white/60 p-4 rounded-xl border border-lime-100">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1">2. Metrics, Category & Location</h4>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Followers</label>
                          <input 
                            type="number" 
                            required
                            value={newInfluencer.followers || 0}
                            onChange={e => setNewInfluencer({...newInfluencer, followers: parseInt(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Engagement %</label>
                          <input 
                            type="number" 
                            step="0.01"
                            value={newInfluencer.engagementPercent || 0}
                            onChange={e => setNewInfluencer({...newInfluencer, engagementPercent: parseFloat(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Category / Niche</label>
                          <input 
                            type="text" 
                            required
                            placeholder="e.g. Beauty"
                            value={newInfluencer.niche || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, niche: e.target.value, category: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Language</label>
                          <input 
                            type="text" 
                            placeholder="e.g. English"
                            value={newInfluencer.language || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, language: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">State</label>
                          <input 
                            type="text" 
                            placeholder="State"
                            value={newInfluencer.state || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, state: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">District</label>
                          <input 
                            type="text" 
                            placeholder="District"
                            value={newInfluencer.district || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, district: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">City</label>
                          <input 
                            type="text" 
                            placeholder="City"
                            value={newInfluencer.city || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, city: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Pincode</label>
                          <input 
                            type="text" 
                            placeholder="Pincode"
                            value={newInfluencer.pincode || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, pincode: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Status</label>
                        <select 
                          value={newInfluencer.status || 'Active'}
                          onChange={e => setNewInfluencer({...newInfluencer, status: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        >
                          <option value="Active">Active</option>
                          <option value="Pending">Pending</option>
                          <option value="Negotiating">Negotiating</option>
                          <option value="Onboarding">Onboarding</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Profile Picture / Avatar URL</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            placeholder="Paste image URL..."
                            value={newInfluencer.avatarUrl || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, avatarUrl: e.target.value})}
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-[11px] text-slate-900 focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                          <button
                            type="button"
                            onClick={handleAutoFetchNewAvatar}
                            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
                          >
                            Fetch
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Contact, Collabs & Performance */}
                    <div className="space-y-4 bg-white/60 p-4 rounded-xl border border-lime-100">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1">3. Contact, Collab & Metrics</h4>
                      
                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Email Address</label>
                        <input 
                          type="email" 
                          value={newInfluencer.email || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, email: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Mobile</label>
                          <input 
                            type="text" 
                            placeholder="Mobile"
                            value={newInfluencer.mobileNumber || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, mobileNumber: e.target.value, phone: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Whatsapp Mobile</label>
                          <input 
                            type="text" 
                            placeholder="WhatsApp"
                            value={newInfluencer.whatsappMobile || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, whatsappMobile: e.target.value, whatsappNumber: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Collab Type</label>
                          <select 
                            value={newInfluencer.collaborationType || 'Paid'}
                            onChange={e => setNewInfluencer({...newInfluencer, collaborationType: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          >
                            <option value="Paid">Paid</option>
                            <option value="Barter">Barter</option>
                            <option value="Affiliate">Affiliate</option>
                            <option value="Gifting">Gifting</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Coupon Code</label>
                          <input 
                            type="text" 
                            value={newInfluencer.couponCode || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, couponCode: e.target.value, referralCode: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Product Sent</label>
                          <input 
                            type="text" 
                            placeholder="Yes/No/Dispatch"
                            value={newInfluencer.productSent || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, productSent: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Payment</label>
                          <input 
                            type="text" 
                            placeholder="Paid/Pending"
                            value={newInfluencer.payment || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, payment: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">UPI ID</label>
                          <input 
                            type="text" 
                            placeholder="UPI Handle"
                            value={newInfluencer.upi || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, upi: e.target.value, gpayNumber: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Campaign</label>
                          <input 
                            type="text" 
                            placeholder="Campaign"
                            value={newInfluencer.campaign || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, campaign: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Amazon Wishlist</label>
                        <input 
                          type="text" 
                          placeholder="Wishlist Link"
                          value={newInfluencer.amazonWishlist || ''}
                          onChange={e => setNewInfluencer({...newInfluencer, amazonWishlist: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Reel Link</label>
                          <input 
                            type="text" 
                            placeholder="https://..."
                            value={newInfluencer.reelLink || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, reelLink: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Story Link</label>
                          <input 
                            type="text" 
                            placeholder="https://..."
                            value={newInfluencer.storyLink || ''}
                            onChange={e => setNewInfluencer({...newInfluencer, storyLink: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <label className="text-[8px] text-slate-600 block mb-1 font-semibold uppercase">Sales Generated</label>
                          <input 
                            type="number" 
                            value={newInfluencer.salesGenerated || 0}
                            onChange={e => setNewInfluencer({...newInfluencer, salesGenerated: parseInt(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-600 block mb-1 font-semibold uppercase">Leads</label>
                          <input 
                            type="number" 
                            value={newInfluencer.leads || 0}
                            onChange={e => setNewInfluencer({...newInfluencer, leads: parseInt(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-600 block mb-1 font-semibold uppercase">ROI</label>
                          <input 
                            type="number" 
                            step="0.1"
                            value={newInfluencer.roi || 0}
                            onChange={e => setNewInfluencer({...newInfluencer, roi: parseFloat(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="flex justify-end gap-2 border-t border-lime-200 pt-4">
                    <button 
                      type="button" 
                      onClick={() => setShowAddInfluencer(false)}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Save Profile
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {editingInfluencer && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-lime-50 border border-lime-200 rounded-2xl p-6 max-w-4xl w-full space-y-4 shadow-xl my-8">
                <div className="flex items-center justify-between border-b border-lime-200 pb-3">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">Edit Influencer Profile</h3>
                    <p className="text-[11px] text-slate-600">Update demographic, metric, social, contact, financial, and ROI data.</p>
                  </div>
                  <button 
                    type="button" 
                    onClick={() => setEditingInfluencer(null)} 
                    className="text-slate-400 hover:text-slate-600 text-xl font-bold p-1"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleUpdateInfluencer} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-h-[60vh] overflow-y-auto pr-2">
                    
                    {/* Column 1: Core Profile & Socials */}
                    <div className="space-y-4 bg-white/60 p-4 rounded-xl border border-lime-100">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1">1. Profile & Socials</h4>
                      
                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Influencer ID</label>
                        <input 
                          type="text" 
                          required
                          value={editingInfluencer.influencerId || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, influencerId: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Name</label>
                        <input 
                          type="text" 
                          required
                          value={editingInfluencer.name || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, name: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Primary Social Handle</label>
                        <input 
                          type="text" 
                          required
                          placeholder="@username"
                          value={editingInfluencer.handle || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, handle: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Primary Platform</label>
                        <select 
                          value={editingInfluencer.platform || 'Instagram'}
                          onChange={e => setEditingInfluencer({...editingInfluencer, platform: e.target.value as any})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        >
                          <option value="Instagram">Instagram</option>
                          <option value="YouTube">YouTube</option>
                          <option value="TikTok">TikTok</option>
                          <option value="Facebook">Facebook</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Instagram Handle</label>
                        <input 
                          type="text" 
                          placeholder="@username"
                          value={editingInfluencer.instagramHandle || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, instagramHandle: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Facebook Handle/Link</label>
                        <input 
                          type="text" 
                          placeholder="fb_user_or_link"
                          value={editingInfluencer.facebook || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, facebook: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">YouTube Handle/Link</label>
                        <input 
                          type="text" 
                          placeholder="yt_channel_or_link"
                          value={editingInfluencer.youtube || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, youtube: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>
                    </div>

                    {/* Column 2: Metrics, Category & Location */}
                    <div className="space-y-4 bg-white/60 p-4 rounded-xl border border-lime-100">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1">2. Metrics, Category & Location</h4>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Followers</label>
                          <input 
                            type="number" 
                            required
                            value={editingInfluencer.followers || 0}
                            onChange={e => setEditingInfluencer({...editingInfluencer, followers: parseInt(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Engagement %</label>
                          <input 
                            type="number" 
                            step="0.01"
                            value={editingInfluencer.engagementPercent || 0}
                            onChange={e => setEditingInfluencer({...editingInfluencer, engagementPercent: parseFloat(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Category / Niche</label>
                          <input 
                            type="text" 
                            required
                            placeholder="e.g. Beauty"
                            value={editingInfluencer.niche || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, niche: e.target.value, category: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Language</label>
                          <input 
                            type="text" 
                            placeholder="e.g. English"
                            value={editingInfluencer.language || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, language: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">State</label>
                          <input 
                            type="text" 
                            placeholder="State"
                            value={editingInfluencer.state || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, state: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">District</label>
                          <input 
                            type="text" 
                            placeholder="District"
                            value={editingInfluencer.district || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, district: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">City</label>
                          <input 
                            type="text" 
                            placeholder="City"
                            value={editingInfluencer.city || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, city: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Pincode</label>
                          <input 
                            type="text" 
                            placeholder="Pincode"
                            value={editingInfluencer.pincode || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, pincode: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Status</label>
                        <select 
                          value={editingInfluencer.status || 'Active'}
                          onChange={e => setEditingInfluencer({...editingInfluencer, status: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        >
                          <option value="Active">Active</option>
                          <option value="Pending">Pending</option>
                          <option value="Negotiating">Negotiating</option>
                          <option value="Onboarding">Onboarding</option>
                          <option value="Inactive">Inactive</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Profile Picture / Avatar URL</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            placeholder="Paste image URL..."
                            value={editingInfluencer.avatarUrl || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, avatarUrl: e.target.value})}
                            className="flex-1 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-[11px] text-slate-900 focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                          <button
                            type="button"
                            onClick={handleAutoFetchEditAvatar}
                            className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-[10px] font-bold transition cursor-pointer"
                          >
                            Fetch
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Contact, Collabs & Performance */}
                    <div className="space-y-4 bg-white/60 p-4 rounded-xl border border-lime-100">
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider border-b border-slate-200 pb-1">3. Contact, Collab & Metrics</h4>
                      
                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Email Address</label>
                        <input 
                          type="email" 
                          value={editingInfluencer.email || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, email: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Mobile</label>
                          <input 
                            type="text" 
                            placeholder="Mobile"
                            value={editingInfluencer.mobileNumber || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, mobileNumber: e.target.value, phone: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Whatsapp Mobile</label>
                          <input 
                            type="text" 
                            placeholder="WhatsApp"
                            value={editingInfluencer.whatsappMobile || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, whatsappMobile: e.target.value, whatsappNumber: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Collab Type</label>
                          <select 
                            value={editingInfluencer.collaborationType || 'Paid'}
                            onChange={e => setEditingInfluencer({...editingInfluencer, collaborationType: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          >
                            <option value="Paid">Paid</option>
                            <option value="Barter">Barter</option>
                            <option value="Affiliate">Affiliate</option>
                            <option value="Gifting">Gifting</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Coupon Code</label>
                          <input 
                            type="text" 
                            value={editingInfluencer.couponCode || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, couponCode: e.target.value, referralCode: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Product Sent</label>
                          <input 
                            type="text" 
                            placeholder="Yes/No/Dispatch"
                            value={editingInfluencer.productSent || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, productSent: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Payment</label>
                          <input 
                            type="text" 
                            placeholder="Paid/Pending"
                            value={editingInfluencer.payment || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, payment: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">UPI ID</label>
                          <input 
                            type="text" 
                            placeholder="UPI Handle"
                            value={editingInfluencer.upi || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, upi: e.target.value, gpayNumber: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Campaign</label>
                          <input 
                            type="text" 
                            placeholder="Campaign"
                            value={editingInfluencer.campaign || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, campaign: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Amazon Wishlist</label>
                        <input 
                          type="text" 
                          placeholder="Wishlist Link"
                          value={editingInfluencer.amazonWishlist || ''}
                          onChange={e => setEditingInfluencer({...editingInfluencer, amazonWishlist: e.target.value})}
                          className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Reel Link</label>
                          <input 
                            type="text" 
                            placeholder="https://..."
                            value={editingInfluencer.reelLink || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, reelLink: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-600 block mb-1 font-semibold uppercase">Story Link</label>
                          <input 
                            type="text" 
                            placeholder="https://..."
                            value={editingInfluencer.storyLink || ''}
                            onChange={e => setEditingInfluencer({...editingInfluencer, storyLink: e.target.value})}
                            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1">
                        <div>
                          <label className="text-[8px] text-slate-600 block mb-1 font-semibold uppercase">Sales Generated</label>
                          <input 
                            type="number" 
                            value={editingInfluencer.salesGenerated || 0}
                            onChange={e => setEditingInfluencer({...editingInfluencer, salesGenerated: parseInt(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-600 block mb-1 font-semibold uppercase">Leads</label>
                          <input 
                            type="number" 
                            value={editingInfluencer.leads || 0}
                            onChange={e => setEditingInfluencer({...editingInfluencer, leads: parseInt(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                        <div>
                          <label className="text-[8px] text-slate-600 block mb-1 font-semibold uppercase">ROI</label>
                          <input 
                            type="number" 
                            step="0.1"
                            value={editingInfluencer.roi || 0}
                            onChange={e => setEditingInfluencer({...editingInfluencer, roi: parseFloat(e.target.value) || 0})}
                            className="bg-white border border-slate-200 rounded-xl px-2 py-1 text-xs text-slate-900 w-full focus:outline-none focus:ring-1 focus:ring-lime-500 focus:border-lime-500"
                          />
                        </div>
                      </div>
                    </div>

                  </div>

                  <div className="flex justify-end gap-2 border-t border-lime-200 pt-4">
                    <button 
                      type="button" 
                      onClick={() => setEditingInfluencer(null)}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {activeChatInfluencer && (
            <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
              <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-lg w-full flex flex-col h-[620px] shadow-2xl text-white">
                
                {/* Modal Header / Instagram Direct Style */}
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Avatar with dynamic ring */}
                    <div className="w-10 h-10 rounded-full p-[2px] bg-gradient-to-tr from-yellow-500 via-red-500 to-purple-600 overflow-hidden flex-shrink-0">
                      {activeChatInfluencer.avatarUrl ? (
                        <img 
                          src={activeChatInfluencer.avatarUrl} 
                          alt={activeChatInfluencer.name} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full rounded-full object-cover border border-slate-900" 
                        />
                      ) : (
                        <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center font-bold text-xs uppercase text-slate-100">
                          {activeChatInfluencer.name.substring(0, 2)}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-sm text-slate-100">{activeChatInfluencer.name}</h4>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="Instagram Connection Active" />
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                        {activeChatInfluencer.handle}
                        <span className="text-slate-600">•</span>
                        <span className="capitalize text-pink-400">{activeChatInfluencer.platform} Direct Chat</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button 
                      onClick={handleClearChatHistory}
                      className="px-2.5 py-1 bg-rose-950/40 hover:bg-rose-950/75 border border-rose-900/40 rounded-lg text-[10px] font-semibold text-rose-400 transition cursor-pointer"
                      title="Clear Chat Log"
                    >
                      Clear Log
                    </button>
                    <a 
                      href={getSocialMediaUrl(activeChatInfluencer.platform, activeChatInfluencer.handle)}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[10px] font-mono text-indigo-400 flex items-center gap-1 cursor-pointer transition"
                    >
                      <span>Profile</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                    <button 
                      onClick={() => setActiveChatInfluencer(null)}
                      className="p-1.5 hover:bg-slate-900 text-slate-400 hover:text-white rounded-lg transition cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Messages Body / Chat Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-slate-800">
                  {/* Messages Mapping */}
                  {(activeChatInfluencer.chatHistory || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-center p-8 space-y-2 h-full my-auto">
                      <MessageSquare className="w-8 h-8 text-slate-600 animate-pulse" />
                      <p className="text-xs text-slate-400 font-medium">No messages logged in this campaign thread.</p>
                      <p className="text-[10px] text-slate-500 max-w-[280px]">
                        Paste or type direct messages below to document negotiations, secure rates, and verify promotional details.
                      </p>
                    </div>
                  ) : (
                    (activeChatInfluencer.chatHistory || []).map((msg) => {
                      const isUser = msg.sender === 'user';
                      return (
                        <div 
                          key={msg.id} 
                          className={`flex items-start gap-2.5 ${isUser ? 'justify-end' : 'justify-start'}`}
                        >
                          {!isUser && (
                            activeChatInfluencer.avatarUrl ? (
                              <img 
                                src={activeChatInfluencer.avatarUrl} 
                                alt={activeChatInfluencer.name} 
                                referrerPolicy="no-referrer"
                                className="w-7 h-7 rounded-full object-cover border border-slate-800 flex-shrink-0"
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] uppercase font-bold text-slate-400 flex-shrink-0">
                                {activeChatInfluencer.name.substring(0, 2)}
                              </div>
                            )
                          )}
                          <div className="max-w-[80%] space-y-1">
                            <div className={`text-xs px-3.5 py-2.5 rounded-2xl shadow-sm leading-relaxed ${
                              isUser 
                                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-tr-none' 
                                : 'bg-green-300 text-slate-950 rounded-tl-none'
                            }`}>
                              {renderMessageTextWithImages(msg.text, msg.imageUrl)}
                            </div>
                            <span className={`block text-[8px] text-slate-500 font-mono ${isUser ? 'text-right' : 'text-left'}`}>
                              {msg.sender === 'user' ? 'Brand' : activeChatInfluencer.name} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Typing Indicator */}
                  {isTyping && (
                    <div className="flex items-start gap-2.5">
                      {activeChatInfluencer.avatarUrl ? (
                        <img 
                          src={activeChatInfluencer.avatarUrl} 
                          alt={activeChatInfluencer.name} 
                          referrerPolicy="no-referrer"
                          className="w-7 h-7 rounded-full object-cover border border-slate-800 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center text-[10px] uppercase font-bold text-slate-400 flex-shrink-0">
                          {activeChatInfluencer.name.substring(0, 2)}
                        </div>
                      )}
                      <div className="flex items-center space-x-1 p-3 bg-slate-800 rounded-2xl rounded-tl-none w-14">
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Quick Pitch Template suggestions */}
                <div className="px-4 py-2 border-t border-slate-900 bg-slate-950/60 flex flex-wrap gap-1.5">
                  <span className="text-[9px] text-slate-500 w-full mb-1 font-bold uppercase tracking-wider">Quick Negotiation Templates (Brand):</span>
                  <button 
                    onClick={() => handleSendChatMessage(`Hey ${activeChatInfluencer.name}! We love your content! We would like to pitch a collaboration for 1 Reel + 1 Story. What are your terms? 🚀`, 'user')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-full text-[10px] text-slate-300 font-medium transition cursor-pointer"
                  >
                    🚀 Pitch 1 Reel + 1 Story
                  </button>
                  <button 
                    onClick={() => handleSendChatMessage("What are your current commercial rates and media kit details? 💰", 'user')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-full text-[10px] text-slate-300 font-medium transition cursor-pointer"
                  >
                    💰 Inquire Rates
                  </button>
                  <button 
                    onClick={() => handleSendChatMessage(`We'd love to dispatch a free premium sample product to you! Can we get your shipping address? 🎁`, 'user')}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-full text-[10px] text-slate-300 font-medium transition cursor-pointer"
                  >
                    🎁 Dispatch Free Sample
                  </button>
                </div>

                {/* Sender Selector & Image Attachment Inputs */}
                <div className="px-4 py-2.5 bg-slate-950 border-t border-slate-900 flex flex-col gap-2">
                  {/* Row 1: Sender Switcher */}
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Log message as:</span>
                    <div className="bg-slate-900 p-0.5 rounded-lg border border-slate-800 flex">
                      <button
                        type="button"
                        onClick={() => setChatSender('user')}
                        className={`px-3 py-1 text-[9px] font-bold rounded-md transition ${chatSender === 'user' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        Brand (User)
                      </button>
                      <button
                        type="button"
                        onClick={() => setChatSender('influencer')}
                        className={`px-3 py-1 text-[9px] font-bold rounded-md transition ${chatSender === 'influencer' ? 'bg-green-300 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                      >
                        {activeChatInfluencer.name.split(' ')[0]} (Influencer)
                      </button>
                    </div>
                  </div>

                  {/* Row 2: Picture URL input */}
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider whitespace-nowrap">Picture URL:</span>
                    <input 
                      type="text"
                      placeholder="Paste image/picture URL to attach (or paste inside message text)..."
                      value={chatImageUrl}
                      onChange={(e) => setChatImageUrl(e.target.value)}
                      className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
                    />
                    {chatImageUrl && (
                      <button 
                        onClick={() => setChatImageUrl('')}
                        className="text-[9px] text-rose-450 hover:underline cursor-pointer font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Messages Input Box */}
                <div className="p-4 border-t border-slate-850 bg-slate-900/40 flex items-center gap-2">
                  <input 
                    type="text"
                    placeholder="Message..."
                    value={chatMessageText}
                    onChange={(e) => setChatMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSendChatMessage();
                      }
                    }}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-full px-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-pink-500 transition"
                  />
                  <button 
                    onClick={() => handleSendChatMessage()}
                    disabled={!chatMessageText.trim() && !chatImageUrl.trim()}
                    className="p-2 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white disabled:opacity-40 transition cursor-pointer"
                    title="Send Message"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* Influencers Catalog Grid / Table */}
          {filteredInfluencers.length === 0 ? (
            <div className="p-12 text-center bg-slate-900/20 border border-slate-800 rounded-3xl text-slate-500 text-xs">
              No influencers found matching search queries.
            </div>
          ) : viewMode === 'table' ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/20 shadow-inner scrollbar-thin scrollbar-thumb-slate-800">
              <table className="w-full text-left border-collapse min-w-[3200px]">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                    <th className="py-3 px-4 sticky left-0 z-20 bg-slate-950 border-r border-slate-800">Actions</th>
                    <th className="py-3 px-3">Pic</th>
                    <th className="py-3 px-3">Influencer ID</th>
                    <th className="py-3 px-3">Name</th>
                    <th className="py-3 px-3">Insta Handle</th>
                    <th className="py-3 px-3">Facebook</th>
                    <th className="py-3 px-3">YouTube</th>
                    <th className="py-3 px-3">Followers</th>
                    <th className="py-3 px-3">Engagement %</th>
                    <th className="py-3 px-3">State</th>
                    <th className="py-3 px-3">District</th>
                    <th className="py-3 px-3">City</th>
                    <th className="py-3 px-3">Pincode</th>
                    <th className="py-3 px-3">Language</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Email</th>
                    <th className="py-3 px-3">Mobile</th>
                    <th className="py-3 px-3">WhatsApp Mobile</th>
                    <th className="py-3 px-3">Amazon Wishlist</th>
                    <th className="py-3 px-3">UPI ID</th>
                    <th className="py-3 px-3">Collab Type</th>
                    <th className="py-3 px-3">Product Sent</th>
                    <th className="py-3 px-3">Payment Status</th>
                    <th className="py-3 px-3">Campaign</th>
                    <th className="py-3 px-3">Reel Link</th>
                    <th className="py-3 px-3">Story Link</th>
                    <th className="py-3 px-3">Coupon Code</th>
                    <th className="py-3 px-3">Sales Generated</th>
                    <th className="py-3 px-3">Leads</th>
                    <th className="py-3 px-3">ROI</th>
                    <th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {filteredInfluencers.map(inf => {
                    const calculatedScore = getInfluencerPerformanceScore(inf);
                    const leadsReferred = inf.leads || 0;
                    const salesOrdersReferred = salesOrders.filter(order => order.deliveryStatus !== 'Cancelled' && order.referralCode?.toUpperCase() === inf.referralCode?.toUpperCase());
                    const conversionRevenue = salesOrdersReferred.reduce((sum, order) => sum + order.totalValue, 0);

                    return (
                      <tr key={inf.id} className="hover:bg-slate-900/30 transition text-xs">
                        {/* Sticky Actions */}
                        <td className="py-2.5 px-4 sticky left-0 z-10 bg-[#0b0c10] border-r border-slate-800">
                          <div className="flex gap-1.5 items-center">
                            <button 
                              onClick={() => handleOpenChat(inf)}
                              className="px-2 py-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-md text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                              title="Direct Chat"
                            >
                              <MessageSquare className="w-2.5 h-2.5" />
                              <span>Chat</span>
                            </button>
                            <button 
                              onClick={() => setEditingInfluencer(inf)}
                              className="px-2 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-md text-[10px] font-bold cursor-pointer transition flex items-center gap-1"
                              title="Edit Profile"
                            >
                              <Edit2 className="w-2.5 h-2.5 text-slate-950" />
                              <span>Edit</span>
                            </button>
                            <button 
                              onClick={() => {
                                if(confirm("Are you sure you want to delete this influencer profile and all linked records?")) {
                                  deleteInfluencer(inf.id);
                                }
                              }}
                              className="p-1 bg-rose-950/20 hover:bg-rose-950/40 text-rose-450 border border-rose-900/30 rounded-md transition cursor-pointer"
                              title="Delete Profile"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </td>

                        {/* Pic */}
                        <td className="py-2 px-3">
                          <div className="w-8 h-8 rounded-full border border-slate-800 bg-slate-900 flex items-center justify-center overflow-hidden">
                            {inf.avatarUrl ? (
                              <img src={inf.avatarUrl} alt={inf.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <span className="text-[10px] text-slate-500 font-bold uppercase">{inf.name.substring(0, 2)}</span>
                            )}
                          </div>
                        </td>

                        {/* Influencer ID */}
                        <td className="py-2 px-3 font-mono font-bold text-slate-400 text-[11px]">
                          {inf.influencerId || `INF-${inf.id.substring(0, 4).toUpperCase()}`}
                        </td>

                        {/* Name */}
                        <td className="py-2 px-3 font-bold text-white whitespace-nowrap">
                          {inf.name}
                        </td>

                        {/* Instagram Handle */}
                        <td className="py-2 px-3">
                          <a 
                            href={getSocialMediaUrl('Instagram', inf.instagramHandle || inf.handle)}
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-pink-400 hover:underline font-mono font-medium"
                          >
                            {inf.instagramHandle || inf.handle || 'N/A'}
                          </a>
                        </td>

                        {/* Facebook */}
                        <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap">
                          {inf.facebook ? (
                            <a href={inf.facebook.startsWith('http') ? inf.facebook : `https://facebook.com/${inf.facebook}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                              {inf.facebook}
                            </a>
                          ) : 'N/A'}
                        </td>

                        {/* YouTube */}
                        <td className="py-2 px-3 font-mono text-[11px] whitespace-nowrap">
                          {inf.youtube ? (
                            <a href={inf.youtube.startsWith('http') ? inf.youtube : `https://youtube.com/${inf.youtube}`} target="_blank" rel="noopener noreferrer" className="text-rose-400 hover:underline">
                              {inf.youtube}
                            </a>
                          ) : 'N/A'}
                        </td>

                        {/* Followers */}
                        <td className="py-2 px-3 font-mono font-bold text-emerald-400 text-[11px]">
                          {inf.followers.toLocaleString()}
                        </td>

                        {/* Engagement % */}
                        <td className="py-2 px-3 font-mono text-[11px] text-amber-400">
                          {inf.engagementPercent !== undefined ? `${inf.engagementPercent}%` : 'N/A'}
                        </td>

                        {/* State */}
                        <td className="py-2 px-3 whitespace-nowrap">{inf.state || 'N/A'}</td>

                        {/* District */}
                        <td className="py-2 px-3 whitespace-nowrap">{inf.district || 'N/A'}</td>

                        {/* City */}
                        <td className="py-2 px-3 whitespace-nowrap">{inf.city || 'N/A'}</td>

                        {/* Pincode */}
                        <td className="py-2 px-3 font-mono text-[11px]">{inf.pincode || 'N/A'}</td>

                        {/* Language */}
                        <td className="py-2 px-3 text-slate-300">{inf.language || 'N/A'}</td>

                        {/* Category */}
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 bg-slate-850 border border-slate-750 rounded-lg text-[10px] font-medium text-slate-200">
                            {inf.category || inf.niche || 'N/A'}
                          </span>
                        </td>

                        {/* Email */}
                        <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{inf.email || 'N/A'}</td>

                        {/* Mobile */}
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                          {inf.mobileNumber || inf.phone || 'N/A'}
                        </td>

                        {/* WhatsappMobile */}
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                          {inf.whatsappMobile || inf.whatsappNumber || 'N/A'}
                        </td>

                        {/* Amazon Wishlist */}
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {inf.amazonWishlist ? (
                            <a href={inf.amazonWishlist} target="_blank" rel="noopener noreferrer" className="text-amber-500 hover:underline inline-flex items-center gap-0.5">
                              <span>Link</span>
                              <ArrowUpRight className="w-2.5 h-2.5" />
                            </a>
                          ) : 'N/A'}
                        </td>

                        {/* UPI */}
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">{inf.upi || inf.gpayNumber || 'N/A'}</td>

                        {/* Collaboration Type */}
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            (inf.collaborationType || 'Paid') === 'Paid' ? 'bg-amber-950 text-amber-400 border border-amber-900/30' :
                            (inf.collaborationType || 'Paid') === 'Barter' ? 'bg-purple-950 text-purple-400 border border-purple-900/30' :
                            'bg-blue-950 text-blue-400 border border-blue-900/30'
                          }`}>
                            {inf.collaborationType || 'Paid'}
                          </span>
                        </td>

                        {/* Product Sent */}
                        <td className="py-2 px-3 text-slate-300 font-medium">{inf.productSent || 'No'}</td>

                        {/* Payment */}
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            (inf.payment || 'Pending') === 'Paid' ? 'text-emerald-400 bg-emerald-950/40' : 'text-amber-400 bg-amber-950/40'
                          }`}>
                            {inf.payment || 'Pending'}
                          </span>
                        </td>

                        {/* Campaign */}
                        <td className="py-2 px-3 text-slate-300 font-medium whitespace-nowrap">{inf.campaign || 'N/A'}</td>

                        {/* Reel Link */}
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {inf.reelLink ? (
                            <a href={inf.reelLink} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline inline-flex items-center gap-0.5">
                              <span>Reel</span>
                              <ArrowUpRight className="w-2.5 h-2.5" />
                            </a>
                          ) : 'N/A'}
                        </td>

                        {/* Story Link */}
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {inf.storyLink ? (
                            <a href={inf.storyLink} target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:underline inline-flex items-center gap-0.5">
                              <span>Story</span>
                              <ArrowUpRight className="w-2.5 h-2.5" />
                            </a>
                          ) : 'N/A'}
                        </td>

                        {/* Coupon Code */}
                        <td className="py-2 px-3 font-mono font-bold text-slate-200">{inf.couponCode || inf.referralCode || 'N/A'}</td>

                        {/* Sales Generated */}
                        <td className="py-2 px-3 font-mono text-[11px] text-indigo-400 font-bold">
                          ₹{(inf.salesGenerated !== undefined ? inf.salesGenerated : conversionRevenue).toLocaleString()}
                        </td>

                        {/* Leads */}
                        <td className="py-2 px-3 font-mono text-[11px] text-slate-300 font-semibold">
                          {inf.leads !== undefined ? inf.leads : leadsReferred}
                        </td>

                        {/* ROI */}
                        <td className="py-2 px-3 font-mono text-[11px] text-amber-400 font-bold">
                          {inf.roi !== undefined ? `${inf.roi}x` : `${calculatedScore / 10}x`}
                        </td>

                        {/* Status */}
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${
                            inf.status === 'Active' ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-900/50' :
                            inf.status === 'Pending' ? 'bg-amber-950/80 text-amber-400 border border-amber-900/50' :
                            'bg-slate-800 text-slate-400 border border-slate-700/50'
                          }`}>
                            {inf.status || 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredInfluencers.map(inf => {
                const calculatedScore = getInfluencerPerformanceScore(inf);
                // Count conversion events linked
                const leadsReferred = inf.leads || 0;
                const salesOrdersReferred = salesOrders.filter(order => order.deliveryStatus !== 'Cancelled' && order.referralCode?.toUpperCase() === inf.referralCode?.toUpperCase());
                const conversionRevenue = salesOrdersReferred.reduce((sum, order) => sum + order.totalValue, 0);

                return (
                  <div key={inf.id} className="bg-slate-900/30 border border-slate-800/80 rounded-3xl p-5 hover:border-slate-700/80 transition-all space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-3">
                        {inf.avatarUrl ? (
                          <img 
                            src={inf.avatarUrl} 
                            alt={inf.name} 
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full object-cover border border-slate-800/80 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center font-bold text-sm uppercase text-slate-300 flex-shrink-0">
                            {inf.name.substring(0, 2)}
                          </div>
                        )}
                        <div>
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wide inline-block mb-1 ${
                            inf.platform === 'Instagram' ? 'bg-pink-950/40 text-pink-400 border border-pink-900/30' :
                            inf.platform === 'YouTube' ? 'bg-rose-950/40 text-rose-400 border border-rose-900/30' :
                            'bg-indigo-950/40 text-indigo-400 border border-indigo-900/30'
                          }`}>
                            {inf.platform}
                          </span>
                          <h4 className="font-bold text-white text-sm leading-tight">{inf.name}</h4>
                          <a 
                            href={getSocialMediaUrl(inf.platform, inf.handle)}
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-300 text-[10px] font-mono mt-0.5 inline-flex items-center gap-1 group transition-colors cursor-pointer"
                            title={`Open ${inf.platform} Profile`}
                          >
                            {inf.handle}
                            <ArrowUpRight className="w-3 h-3 text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                          </a>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-[9px] text-slate-500 block font-mono uppercase">Followers</span>
                        <span className="font-mono text-xs font-bold text-slate-300">{inf.followers.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 bg-[#0d0d10]/55 p-3 rounded-2xl border border-slate-900">
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold">Niche</span>
                        <span className="text-[10px] text-slate-200 font-semibold block truncate mt-0.5" title={inf.niche}>{inf.niche}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold">Promo Code</span>
                        <span className="text-[10px] text-slate-200 font-mono font-bold block mt-0.5">{inf.referralCode || 'None'}</span>
                      </div>
                      <div>
                        <span className="text-[8px] text-slate-500 uppercase tracking-widest block font-bold">Perf. Score</span>
                        <span className="text-[10px] text-amber-400 font-mono font-bold block mt-0.5">{calculatedScore}/100</span>
                      </div>
                    </div>

                    {/* True Sales Tracking via CRM sync */}
                    <div className="space-y-1 text-[11px] text-slate-400 border-t border-slate-800/80 pt-3">
                      <div className="flex justify-between">
                        <span>Leads Generated:</span>
                        <span className="text-slate-200 font-semibold">{leadsReferred} leads</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Direct Sales Synced:</span>
                        <span className="text-indigo-400 font-bold">{salesOrdersReferred.length} orders (₹{conversionRevenue.toLocaleString()})</span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-500">
                        <span>Email:</span>
                        <span className="truncate max-w-[150px] text-slate-300" title={inf.email}>{inf.email || 'N/A'}</span>
                      </div>

                      {/* Comprehensive Contact Details requested by User */}
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mt-2 pt-2 border-t border-slate-800/40 text-[9px] bg-slate-950/20 p-2.5 rounded-xl border border-slate-900/40">
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">Mobile No</span>
                          <span className="text-slate-300 font-mono font-medium block truncate">{inf.mobileNumber || inf.phone || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">WhatsApp</span>
                          <span className="text-slate-300 font-mono font-medium block truncate">{inf.whatsappNumber || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">Contact No</span>
                          <span className="text-slate-300 font-mono font-medium block truncate">{inf.contactNumber || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-[8px] text-slate-500 block uppercase font-bold tracking-wider">GPay UPI No</span>
                          <span className="text-slate-300 font-mono font-medium block truncate">{inf.gpayNumber || 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    {canEdit && (
                      <div className="flex justify-end gap-2 pt-1 border-t border-slate-800/80">
                        <button 
                          onClick={() => handleOpenChat(inf)}
                          className="px-2.5 py-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white rounded-lg transition flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                          title="Instagram Direct Chat"
                        >
                          <MessageSquare className="w-3 h-3" />
                          <span>Chat</span>
                        </button>
                        <button 
                          onClick={() => setEditingInfluencer(inf)}
                          className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg transition flex items-center gap-1 text-[11px] font-bold cursor-pointer"
                          title="Edit Influencer"
                        >
                          <Edit2 className="w-3 h-3 text-slate-950" />
                          <span>Edit</span>
                        </button>
                        <button 
                          onClick={() => {
                            if(confirm("Are you sure you want to delete this influencer profile and all linked records?")) {
                               deleteInfluencer(inf.id);
                            }
                          }}
                          className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 text-rose-450 border border-rose-900/30 rounded-lg transition cursor-pointer"
                          title="Delete Influencer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================== 3. CAMPAIGNS & BRIEFS ==================== */}
      {activeTab === 'campaigns' && (
        <div className="space-y-6 animate-fade-in" id="infl-tab-campaigns">
          {/* Header Action Grid */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/30 p-4 border border-slate-800 rounded-2xl">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-indigo-400">Campaign Management Hub</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Collaborations, agreements, milestones, and Gemini creative automation.</p>
            </div>

            {canCreate && (
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <button 
                  onClick={() => setShowAddCollaboration(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Briefcase className="w-3.5 h-3.5 text-white" />
                  Link Collaboration
                </button>
                <button 
                  onClick={() => setShowAddCampaign(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-white" />
                  Create Campaign Master
                </button>
              </div>
            )}
          </div>

          {/* Create Campaign Modal */}
          {showAddCampaign && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-green-300 border border-green-400 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-xl text-slate-950">
                <h3 className="font-bold text-slate-900 text-base">Create Campaign Master Record</h3>
                <form onSubmit={handleCreateCampaign} className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Campaign Title / Name</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Summer Health Blast 2026"
                      value={newCampaign.name}
                      onChange={e => setNewCampaign({...newCampaign, name: e.target.value})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Budget allocated (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={newCampaign.budget}
                      onChange={e => setNewCampaign({...newCampaign, budget: parseInt(e.target.value) || 0})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Advertising Budget (Ad Spend)</label>
                    <input 
                      type="number" 
                      required
                      value={newCampaign.advertisingCost}
                      onChange={e => setNewCampaign({...newCampaign, advertisingCost: parseInt(e.target.value) || 0})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Other Campaign Expenses (₹)</label>
                    <input 
                      type="number" 
                      value={newCampaign.otherExpenses}
                      onChange={e => setNewCampaign({...newCampaign, otherExpenses: parseInt(e.target.value) || 0})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Status</label>
                    <select 
                      value={newCampaign.status}
                      onChange={e => setNewCampaign({...newCampaign, status: e.target.value as any})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    >
                      <option value="Planned">Planned</option>
                      <option value="Active">Active</option>
                      <option value="Paused">Paused</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Start Date</label>
                    <input 
                      type="date" 
                      required
                      value={newCampaign.startDate}
                      onChange={e => setNewCampaign({...newCampaign, startDate: e.target.value})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">End Date</label>
                    <input 
                      type="date" 
                      value={newCampaign.endDate}
                      onChange={e => setNewCampaign({...newCampaign, endDate: e.target.value})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Target Products promoted</label>
                    <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto bg-green-200 p-2 rounded-xl border border-green-400">
                      {products.map(p => (
                        <label key={p.id} className="flex items-center gap-2 text-xs text-slate-900 font-medium">
                          <input 
                            type="checkbox"
                            checked={newCampaign.targetProductIds?.includes(p.id)}
                            onChange={e => {
                              const ids = newCampaign.targetProductIds || [];
                              if (e.target.checked) {
                                setNewCampaign({...newCampaign, targetProductIds: [...ids, p.id]});
                              } else {
                                setNewCampaign({...newCampaign, targetProductIds: ids.filter(id => id !== p.id)});
                              }
                            }}
                            className="rounded border-green-400 text-green-700 focus:ring-green-500"
                          />
                          <span className="truncate">{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Campaign Goal / Description</label>
                    <textarea 
                      required
                      placeholder="e.g. Highlight physical health pack and driving organic Amazon cart clicks."
                      value={newCampaign.goal}
                      onChange={e => setNewCampaign({...newCampaign, goal: e.target.value})}
                      className="bg-white border border-green-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full h-16 focus:outline-none focus:ring-1 focus:ring-green-700 focus:border-green-700"
                    />
                  </div>

                  <div className="col-span-2 flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddCampaign(false)}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Save Campaign
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Create Collaboration Modal */}
          {showAddCollaboration && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-lime-300 border border-lime-400 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-xl text-slate-950">
                <h3 className="font-bold text-slate-900 text-base">Link Influencer to Campaign</h3>
                <form onSubmit={handleCreateCollaboration} className="space-y-4">
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Campaign Master</label>
                    <select 
                      required
                      value={newCollaboration.campaignId}
                      onChange={e => setNewCollaboration({...newCollaboration, campaignId: e.target.value})}
                      className="bg-white border border-lime-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-lime-700 focus:border-lime-700"
                    >
                      <option value="">-- Choose Campaign --</option>
                      {influencerCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Influencer Profile</label>
                    <select 
                      required
                      value={newCollaboration.influencerId}
                      onChange={e => setNewCollaboration({...newCollaboration, influencerId: e.target.value})}
                      className="bg-white border border-lime-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-lime-700 focus:border-lime-700"
                    >
                      <option value="">-- Choose Influencer --</option>
                      {influencers.map(i => <option key={i.id} value={i.id}>{i.name} ({i.handle})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Agreed Sponsor Fee (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={newCollaboration.agreedFee}
                      onChange={e => setNewCollaboration({...newCollaboration, agreedFee: parseInt(e.target.value) || 0})}
                      className="bg-white border border-lime-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-lime-700 focus:border-lime-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Status</label>
                    <select 
                      value={newCollaboration.status}
                      onChange={e => setNewCollaboration({...newCollaboration, status: e.target.value as any})}
                      className="bg-white border border-lime-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full focus:outline-none focus:ring-1 focus:ring-lime-700 focus:border-lime-700"
                    >
                      <option value="Proposed">Proposed</option>
                      <option value="Negotiating">Negotiating</option>
                      <option value="Signed">Signed</option>
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-800 block mb-1 font-bold uppercase">Terms / Agreement Notes</label>
                    <textarea 
                      placeholder="Special deliverables, post frequencies etc."
                      value={newCollaboration.notes}
                      onChange={e => setNewCollaboration({...newCollaboration, notes: e.target.value})}
                      className="bg-white border border-lime-400 rounded-xl px-3 py-2 text-xs text-slate-950 w-full h-16 focus:outline-none focus:ring-1 focus:ring-lime-700 focus:border-lime-700"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddCollaboration(false)}
                      className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      Save Link
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Active Collaborations List */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* List left/center */}
            <div className="lg:col-span-2 bg-slate-900/20 border border-slate-800 p-5 rounded-2xl space-y-4">
              <h4 className="font-bold text-white text-sm">Active Agreements & Collaborations</h4>
              {influencerCollaborations.length === 0 ? (
                <p className="text-xs text-slate-500 p-4 bg-slate-900/30 rounded-xl text-center">No collaborations registered. Link an influencer to a campaign above.</p>
              ) : (
                <div className="space-y-3">
                  {influencerCollaborations.map(col => {
                    const campaign = influencerCampaigns.find(c => c.id === col.campaignId);
                    const influencer = influencers.find(i => i.id === col.influencerId);
                    if (!campaign || !influencer) return null;

                    return (
                      <div key={col.id} className="p-4 bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{influencer.name}</span>
                            <span className="text-xs text-indigo-400">→</span>
                            <span className="text-xs font-semibold text-indigo-300">{campaign.name}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1">
                            Sponsorship: <span className="font-bold text-slate-200">₹{col.agreedFee.toLocaleString()}</span> • Promo Code: <span className="font-mono text-slate-200 font-bold">{influencer.referralCode || 'None'}</span>
                          </p>
                          {col.notes && <p className="text-[10px] text-slate-500 italic mt-0.5">"{col.notes}"</p>}
                        </div>

                        <div className="flex items-center gap-3">
                          <select 
                            value={col.status}
                            onChange={e => updateInfluencerCollaboration(col.id, { status: e.target.value as any })}
                            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[10px] text-slate-300 font-bold uppercase"
                          >
                            <option value="Proposed">Proposed</option>
                            <option value="Negotiating">Negotiating</option>
                            <option value="Signed">Signed</option>
                            <option value="Active">Active</option>
                            <option value="Completed">Completed</option>
                          </select>

                          <button 
                            onClick={() => {
                              if (confirm("Delete this collaboration?")) deleteInfluencerCollaboration(col.id);
                            }}
                            className="p-1.5 bg-rose-950/20 hover:bg-rose-950/40 text-rose-450 border border-rose-900/30 rounded-lg"
                          >
                            <Trash2 className="w-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* AI Assistant Toolkit */}
            <div className="bg-slate-900/20 border border-slate-800 p-5 rounded-2xl space-y-4">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-pink-400 animate-pulse" />
                <h4 className="font-bold text-white text-sm">Gemini AI Assistant Suite</h4>
              </div>
              <p className="text-[10px] text-slate-400">
                Automate brief creation, niche mapping recommendations, and engaging caption copywriting in real-time.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[9px] text-slate-400 block mb-1 uppercase font-bold">Select Tool</label>
                  <div className="grid grid-cols-3 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button 
                      onClick={() => setAiAction('recommend_influencers')}
                      className={`py-1 text-[9px] rounded-lg font-bold transition-all cursor-pointer ${aiAction === 'recommend_influencers' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Niche Map
                    </button>
                    <button 
                      onClick={() => setAiAction('write_brief')}
                      className={`py-1 text-[9px] rounded-lg font-bold transition-all cursor-pointer ${aiAction === 'write_brief' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Write Brief
                    </button>
                    <button 
                      onClick={() => setAiAction('generate_captions')}
                      className={`py-1 text-[9px] rounded-lg font-bold transition-all cursor-pointer ${aiAction === 'generate_captions' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      Copywriter
                    </button>
                  </div>
                </div>

                {/* Target product input */}
                <div>
                  <label className="text-[9px] text-slate-400 block mb-1 uppercase font-bold">Target Product Name</label>
                  <select 
                    value={aiProduct}
                    onChange={e => setAiProduct(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-300 w-full"
                  >
                    <option value="">-- Choose Product --</option>
                    {products.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>

                {/* Campaign Goal */}
                <div>
                  <label className="text-[9px] text-slate-400 block mb-1 uppercase font-bold">Campaign Main Objective</label>
                  <input 
                    type="text"
                    placeholder="e.g. Drive 100 immediate Amazon sales of physical health pack"
                    value={aiGoal}
                    onChange={e => setAiGoal(e.target.value)}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white w-full"
                  />
                </div>

                {aiAction === 'write_brief' && (
                  <div>
                    <label className="text-[9px] text-slate-400 block mb-1 uppercase font-bold">Campaign Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Summer Health Blast 2026"
                      value={aiCampaignName}
                      onChange={e => setAiCampaignName(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-white w-full"
                    />
                  </div>
                )}

                {aiAction === 'generate_captions' && (
                  <div>
                    <label className="text-[9px] text-slate-400 block mb-1 uppercase font-bold">Caption Tone</label>
                    <select 
                      value={aiCaptionTone}
                      onChange={e => setAiCaptionTone(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5 text-xs text-slate-300 w-full"
                    >
                      <option value="creative">Creative & Organic</option>
                      <option value="punchy">Short & Punchy</option>
                      <option value="storytelling">Storytelling-driven</option>
                      <option value="educational">Educational & Informative</option>
                    </select>
                  </div>
                )}

                <button 
                  onClick={handleAIRequest}
                  disabled={aiLoading}
                  className="w-full py-2 bg-gradient-to-r from-pink-600 to-indigo-600 hover:from-pink-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow disabled:opacity-50"
                >
                  {aiLoading ? '🔄 Working...' : '⚡ Generate AI Suggestions'}
                </button>

                {aiResult && (
                  <div className="bg-slate-950 border border-slate-800/80 p-3.5 rounded-xl max-h-48 overflow-y-auto">
                    <span className="text-[9px] font-bold text-pink-400 uppercase tracking-wide block mb-1">AI Recommendation Result</span>
                    <p className="text-slate-300 text-[10.5px] leading-relaxed whitespace-pre-line">{aiResult}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================== 4. LOGISTICS & CONTENT ==================== */}
      {activeTab === 'logistics' && (
        <div className="space-y-6 animate-fade-in" id="infl-tab-logistics">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/30 p-4 border border-slate-800 rounded-2xl">
            <div>
              <h3 className="font-bold text-white text-xs uppercase tracking-wider text-indigo-400">Product Dispatch, Payments & Content tracking</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Verify free sample deliveries, execute reimbursement payments, and record video performance metrics.</p>
            </div>

            {canCreate && (
              <div className="flex flex-wrap gap-2">
                <button 
                  onClick={() => setShowAddDispatch(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Gift className="w-3.5 h-3.5 text-white" />
                  Dispatch Product
                </button>
                <button 
                  onClick={() => setShowAddPayment(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-semibold flex items-center gap-1 cursor-pointer transition-all"
                >
                  <DollarSign className="w-3.5 h-3.5 text-white" />
                  Sponsor Payment
                </button>
                <button 
                  onClick={() => setShowAddContent(true)}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Video className="w-4 h-4 text-white" />
                  Log Video Link
                </button>
              </div>
            )}
          </div>

          {/* Add Dispatch Modal */}
          {showAddDispatch && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#0f0f12] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
                <h3 className="font-bold text-white text-base">Dispatch Product Tracking</h3>
                <form onSubmit={handleCreateDispatch} className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Influencer Collaboration Link</label>
                    <select 
                      required
                      value={newDispatch.collaborationId}
                      onChange={e => setNewDispatch({...newDispatch, collaborationId: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    >
                      <option value="">-- Select Collaboration --</option>
                      {influencerCollaborations.map(col => {
                        const inf = influencers.find(i => i.id === col.influencerId);
                        const camp = influencerCampaigns.find(c => c.id === col.campaignId);
                        return <option key={col.id} value={col.id}>{inf?.name} - {camp?.name}</option>;
                      })}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Product Sent</label>
                    <select 
                      required
                      value={newDispatch.productId}
                      onChange={e => setNewDispatch({...newDispatch, productId: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    >
                      <option value="">-- Choose Product --</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} (SKU: {p.sku})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Sample cost (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={newDispatch.productCost}
                      onChange={e => setNewDispatch({...newDispatch, productCost: parseInt(e.target.value) || 0})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Shipping cost (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={newDispatch.shippingCost}
                      onChange={e => setNewDispatch({...newDispatch, shippingCost: parseInt(e.target.value) || 0})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Dispatch Type</label>
                    <select 
                      value={newDispatch.dispatchType}
                      onChange={e => setNewDispatch({...newDispatch, dispatchType: e.target.value as any})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    >
                      <option value="Free Sample">Free Sample</option>
                      <option value="Amazon Purchase">Amazon Purchase</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Amazon Reimbursement (₹)</label>
                    <input 
                      type="number" 
                      value={newDispatch.reimbursementAmount}
                      disabled={newDispatch.dispatchType !== 'Amazon Purchase'}
                      onChange={e => setNewDispatch({...newDispatch, reimbursementAmount: parseInt(e.target.value) || 0})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Amazon Order ID</label>
                    <input 
                      type="text" 
                      placeholder="e.g. 403-1234567-89012"
                      value={newDispatch.amazonOrderId}
                      disabled={newDispatch.dispatchType !== 'Amazon Purchase'}
                      onChange={e => setNewDispatch({...newDispatch, amazonOrderId: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Tracking Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. SF12345IN"
                      value={newDispatch.trackingNumber}
                      onChange={e => setNewDispatch({...newDispatch, trackingNumber: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    />
                  </div>

                  <div className="col-span-2 flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddDispatch(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold"
                    >
                      Record Dispatch
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add Sponsor Payment Modal */}
          {showAddPayment && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#0f0f12] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
                <h3 className="font-bold text-white text-base">Record Service Sponsorship Payment</h3>
                <form onSubmit={handleCreatePayment} className="space-y-4">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Influencer Collaboration</label>
                    <select 
                      required
                      value={newPayment.collaborationId}
                      onChange={e => setNewPayment({...newPayment, collaborationId: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    >
                      <option value="">-- Select Collaboration --</option>
                      {influencerCollaborations.map(col => {
                        const inf = influencers.find(i => i.id === col.influencerId);
                        const camp = influencerCampaigns.find(c => c.id === col.campaignId);
                        return <option key={col.id} value={col.id}>{inf?.name} - {camp?.name}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Amount approved (₹)</label>
                    <input 
                      type="number" 
                      required
                      value={newPayment.amount}
                      onChange={e => setNewPayment({...newPayment, amount: parseInt(e.target.value) || 0})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Payment Method</label>
                      <select 
                        value={newPayment.paymentMethod}
                        onChange={e => setNewPayment({...newPayment, paymentMethod: e.target.value as any})}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                      >
                        <option value="UPI">UPI</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Stripe">Stripe</option>
                        <option value="PayPal">PayPal</option>
                        <option value="Cash">Cash</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Payment Status</label>
                      <select 
                        value={newPayment.status}
                        onChange={e => setNewPayment({...newPayment, status: e.target.value as any})}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Reference ID / Txn Number</label>
                    <input 
                      type="text" 
                      placeholder="e.g. UPI1234567890"
                      value={newPayment.referenceNumber}
                      onChange={e => setNewPayment({...newPayment, referenceNumber: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddPayment(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold"
                    >
                      Record Payment
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Add Deliverable Content Modal */}
          {showAddContent && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-[#0f0f12] border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4">
                <h3 className="font-bold text-white text-base">Record Video / Social Deliverable</h3>
                <form onSubmit={handleCreateContent} className="space-y-4">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Collaboration Campaign</label>
                    <select 
                      required
                      value={newContent.collaborationId}
                      onChange={e => setNewContent({...newContent, collaborationId: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    >
                      <option value="">-- Select Collaboration --</option>
                      {influencerCollaborations.map(col => {
                        const inf = influencers.find(i => i.id === col.influencerId);
                        const camp = influencerCampaigns.find(c => c.id === col.campaignId);
                        return <option key={col.id} value={col.id}>{inf?.name} - {camp?.name}</option>;
                      })}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Content Format</label>
                      <select 
                        value={newContent.deliverableType}
                        onChange={e => setNewContent({...newContent, deliverableType: e.target.value as any})}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                      >
                        <option value="Reel">Reel</option>
                        <option value="Post">Post</option>
                        <option value="Story">Story</option>
                        <option value="YouTube Video">YouTube Video</option>
                        <option value="TikTok Video">TikTok Video</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Publication Status</label>
                      <select 
                        value={newContent.status}
                        onChange={e => setNewContent({...newContent, status: e.target.value as any})}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                      >
                        <option value="Pending Draft">Pending Draft</option>
                        <option value="Approved">Approved</option>
                        <option value="Live">Live</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Live Link / URL</label>
                    <input 
                      type="url" 
                      required
                      placeholder="https://instagram.com/reel/..."
                      value={newContent.link}
                      onChange={e => setNewContent({...newContent, link: e.target.value})}
                      className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Views Count</label>
                      <input 
                        type="number" 
                        value={newContent.views}
                        onChange={e => setNewContent({...newContent, views: parseInt(e.target.value) || 0})}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Likes</label>
                      <input 
                        type="number" 
                        value={newContent.likes}
                        onChange={e => setNewContent({...newContent, likes: parseInt(e.target.value) || 0})}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1 font-semibold uppercase">Comments</label>
                      <input 
                        type="number" 
                        value={newContent.comments}
                        onChange={e => setNewContent({...newContent, comments: parseInt(e.target.value) || 0})}
                        className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white w-full"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button 
                      type="button" 
                      onClick={() => setShowAddContent(false)}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit" 
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold"
                    >
                      Save Deliverable
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Combined Operations Visualizer lists */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Dispatches List */}
            <div className="bg-slate-900/20 border border-slate-800 p-5 rounded-2xl space-y-3">
              <span className="text-[10px] text-indigo-400 uppercase tracking-widest block font-bold">Logistics tracking</span>
              <h4 className="font-bold text-white text-sm">Dispatched Samples & Orders</h4>

              {influencerDispatches.length === 0 ? (
                <p className="p-4 text-center text-slate-500 text-xs italic bg-slate-900/30 rounded-xl">No products dispatched yet.</p>
              ) : (
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto">
                  {influencerDispatches.map(disp => {
                    const col = influencerCollaborations.find(c => c.id === disp.collaborationId);
                    const inf = col ? influencers.find(i => i.id === col.influencerId) : null;
                    const prod = products.find(p => p.id === disp.productId);

                    return (
                      <div key={disp.id} className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1.5">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-white text-xs">{inf?.name || 'Unknown Influencer'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            disp.deliveryStatus === 'Delivered' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {disp.deliveryStatus}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Product: <span className="text-indigo-400 font-semibold">{prod?.name || 'Unknown'}</span>
                        </p>
                        <p className="text-[9px] text-slate-500">
                          {disp.dispatchType} • {disp.trackingNumber ? `Track: ${disp.trackingNumber}` : 'No tracking'}
                        </p>
                        {disp.dispatchType === 'Amazon Purchase' && (
                          <p className="text-[9px] text-amber-400 bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-900/30">
                            Reimbursement: ₹{disp.reimbursementAmount} • Order: {disp.amazonOrderId || 'N/A'}
                          </p>
                        )}
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/60 mt-1">
                          <select 
                            value={disp.deliveryStatus}
                            onChange={e => updateInfluencerDispatch(disp.id, { deliveryStatus: e.target.value as any })}
                            className="bg-slate-950 text-[9px] text-slate-300 rounded border border-slate-800 px-1 py-0.5"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Shipped">Shipped</option>
                            <option value="Delivered">Delivered</option>
                            <option value="Reimbursed">Reimbursed</option>
                          </select>
                          <button 
                            onClick={() => deleteInfluencerDispatch(disp.id)}
                            className="text-rose-450 hover:text-rose-400 font-bold text-[9px]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payments List */}
            <div className="bg-slate-900/20 border border-slate-800 p-5 rounded-2xl space-y-3">
              <span className="text-[10px] text-indigo-400 uppercase tracking-widest block font-bold">Payments Registry</span>
              <h4 className="font-bold text-white text-sm">Sponsorship Disbursements</h4>

              {influencerPayments.length === 0 ? (
                <p className="p-4 text-center text-slate-500 text-xs italic bg-slate-900/30 rounded-xl">No payments registered yet.</p>
              ) : (
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto">
                  {influencerPayments.map(pay => {
                    const col = influencerCollaborations.find(c => c.id === pay.collaborationId);
                    const inf = col ? influencers.find(i => i.id === col.influencerId) : null;

                    return (
                      <div key={pay.id} className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1.5">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-white text-xs">{inf?.name || 'Unknown Influencer'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            pay.status === 'Paid' ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/40' : 'bg-rose-950/40 text-rose-400 border border-rose-900/40'
                          }`}>
                            {pay.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold">
                          Amount: <span className="text-emerald-400">₹{(pay.amount ?? 0).toLocaleString()}</span>
                        </p>
                        <p className="text-[9px] text-slate-500">
                          Method: {pay.paymentMethod} • Date: {pay.paymentDate}
                        </p>
                        {pay.referenceNumber && (
                          <p className="text-[9px] text-slate-400 font-mono">
                            Ref: {pay.referenceNumber}
                          </p>
                        )}
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/60 mt-1">
                          <select 
                            value={pay.status}
                            onChange={e => updateInfluencerPayment(pay.id, { status: e.target.value as any })}
                            className="bg-slate-950 text-[9px] text-slate-300 rounded border border-slate-800 px-1 py-0.5"
                          >
                            <option value="Pending">Pending</option>
                            <option value="Paid">Paid</option>
                          </select>
                          <button 
                            onClick={() => deleteInfluencerPayment(pay.id)}
                            className="text-rose-450 hover:text-rose-400 font-bold text-[9px]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Content Link Deliverables List */}
            <div className="bg-slate-900/20 border border-slate-800 p-5 rounded-2xl space-y-3">
              <span className="text-[10px] text-indigo-400 uppercase tracking-widest block font-bold">Publication tracking</span>
              <h4 className="font-bold text-white text-sm">Social Deliverables Links</h4>

              {influencerContents.length === 0 ? (
                <p className="p-4 text-center text-slate-500 text-xs italic bg-slate-900/30 rounded-xl">No videos tracked yet.</p>
              ) : (
                <div className="space-y-2.5 max-h-[400px] overflow-y-auto">
                  {influencerContents.map(cont => {
                    const col = influencerCollaborations.find(c => c.id === cont.collaborationId);
                    const inf = col ? influencers.find(i => i.id === col.influencerId) : null;

                    return (
                      <div key={cont.id} className="p-3 bg-slate-900/50 border border-slate-800/80 rounded-xl space-y-1.5">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-white text-xs">{inf?.name || 'Unknown Influencer'}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                            cont.status === 'Live' ? 'bg-indigo-950 text-indigo-400 border border-indigo-900/40' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {cont.status}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-semibold">
                          Format: {cont.deliverableType}
                        </p>
                        <a 
                          href={cont.link} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="text-[10px] text-indigo-400 hover:underline block truncate font-mono"
                          title={cont.link}
                        >
                          {cont.link}
                        </a>
                        <div className="grid grid-cols-3 gap-1 text-[9px] text-slate-400 bg-slate-950/60 p-1.5 rounded">
                          <div>
                            <span className="text-slate-500 block">Views</span>
                            <span className="font-bold font-mono text-white">{(cont.views ?? 0).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Likes</span>
                            <span className="font-bold font-mono text-white">{(cont.likes ?? 0).toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block">Comments</span>
                            <span className="font-bold font-mono text-white">{(cont.comments ?? 0).toLocaleString()}</span>
                          </div>
                        </div>
                        <div className="flex justify-between items-center pt-1.5 border-t border-slate-800/60 mt-1">
                          <select 
                            value={cont.status}
                            onChange={e => updateInfluencerContent(cont.id, { status: e.target.value as any })}
                            className="bg-slate-950 text-[9px] text-slate-300 rounded border border-slate-800 px-1 py-0.5"
                          >
                            <option value="Pending Draft">Pending Draft</option>
                            <option value="Approved">Approved</option>
                            <option value="Live">Live</option>
                          </select>
                          <button 
                            onClick={() => deleteInfluencerContent(cont.id)}
                            className="text-rose-450 hover:text-rose-400 font-bold text-[9px]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
