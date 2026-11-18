/// LeafyServer / LeafyMart | Flutter Banner Delivery Contract (Section 7)
///
/// Supports both:
/// 1. Normalized public response from `GET /api/public/banners?pageType=...&pageId=...&placement=hero`
///    and Firestore `banners/{bannerId}` documents.
/// 2. Backward-compatible `home_banners/main_video` document for legacy Flutter clients.
library banner_delivery_model;

class BannerMediaAsset {
  final String url;
  final String mimeType;
  final int? width;
  final int? height;
  final double? durationSec;

  const BannerMediaAsset({
    required this.url,
    required this.mimeType,
    this.width,
    this.height,
    this.durationSec,
  });

  factory BannerMediaAsset.fromJson(Map<String, dynamic> json) {
    return BannerMediaAsset(
      url: (json['url'] ?? '').toString(),
      mimeType: (json['mimeType'] ?? 'video/mp4').toString(),
      width: json['width'] is num ? (json['width'] as num).toInt() : null,
      height: json['height'] is num ? (json['height'] as num).toInt() : null,
      durationSec:
          json['durationSec'] is num ? (json['durationSec'] as num).toDouble() : null,
    );
  }
}

class BannerCtaAction {
  final String label;
  final String route;

  const BannerCtaAction({
    required this.label,
    required this.route,
  });

  /// Ensures route is a safe internal application path before navigating.
  bool get isSafeInternalRoute {
    final trimmed = route.trim();
    if (!trimmed.startsWith('/')) return false;
    final lower = trimmed.toLowerCase();
    if (lower.startsWith('//') ||
        lower.contains('..') ||
        lower.contains('javascript:') ||
        lower.contains('http://') ||
        lower.contains('https://')) {
      return false;
    }
    return true;
  }

  factory BannerCtaAction.fromJson(Map<String, dynamic> json) {
    return BannerCtaAction(
      label: (json['label'] ?? 'Shop Now').toString(),
      route: (json['route'] ?? '/products').toString(),
    );
  }
}

class PublicBannerItem {
  final String id;
  final String pageType;
  final String? pageId;
  final String placement;
  final String title;
  final String subtitle;
  final String mediaType; // 'video' | 'image'
  final int sortOrder;
  final bool carouselEnabled;
  final BannerMediaAsset? mobile;
  final BannerMediaAsset? desktop;
  final BannerMediaAsset? mobilePoster;
  final BannerMediaAsset? desktopPoster;
  final BannerCtaAction? cta;
  final bool autoplay;
  final bool loop;

  const PublicBannerItem({
    required this.id,
    required this.pageType,
    this.pageId,
    required this.placement,
    required this.title,
    required this.subtitle,
    required this.mediaType,
    required this.sortOrder,
    required this.carouselEnabled,
    this.mobile,
    this.desktop,
    this.mobilePoster,
    this.desktopPoster,
    this.cta,
    this.autoplay = true,
    this.loop = true,
  });

  /// Responsive media asset selection:
  /// Mobile Flutter clients (or narrow viewports < 768 logical px) select `mobile` with `desktop` fallback;
  /// Flutter Web/Desktop (>= 768 logical px) selects `desktop` with `mobile` fallback.
  BannerMediaAsset? selectResponsiveAsset({required double layoutWidth}) {
    final useMobile = layoutWidth < 768.0;
    if (useMobile) {
      return (mobile != null && mobile!.url.isNotEmpty) ? mobile : desktop;
    }
    return (desktop != null && desktop!.url.isNotEmpty) ? desktop : mobile;
  }

  BannerMediaAsset? selectResponsivePoster({required double layoutWidth}) {
    final useMobile = layoutWidth < 768.0;
    if (useMobile) {
      return (mobilePoster != null && mobilePoster!.url.isNotEmpty)
          ? mobilePoster
          : desktopPoster;
    }
    return (desktopPoster != null && desktopPoster!.url.isNotEmpty)
        ? desktopPoster
        : mobilePoster;
  }

  factory PublicBannerItem.fromJson(Map<String, dynamic> json) {
    final playback = json['playback'] is Map<String, dynamic>
        ? json['playback'] as Map<String, dynamic>
        : const <String, dynamic>{};
    return PublicBannerItem(
      id: (json['id'] ?? '').toString(),
      pageType: (json['pageType'] ?? 'home').toString(),
      pageId: json['pageId']?.toString(),
      placement: (json['placement'] ?? 'hero').toString(),
      title: (json['title'] ?? '').toString(),
      subtitle: (json['subtitle'] ?? '').toString(),
      mediaType: (json['mediaType'] ?? 'video').toString(),
      sortOrder: json['sortOrder'] is num ? (json['sortOrder'] as num).toInt() : 1,
      carouselEnabled: json['carouselEnabled'] == true,
      mobile: json['mobile'] is Map<String, dynamic>
          ? BannerMediaAsset.fromJson(json['mobile'] as Map<String, dynamic>)
          : null,
      desktop: json['desktop'] is Map<String, dynamic>
          ? BannerMediaAsset.fromJson(json['desktop'] as Map<String, dynamic>)
          : null,
      mobilePoster: json['mobilePoster'] is Map<String, dynamic>
          ? BannerMediaAsset.fromJson(json['mobilePoster'] as Map<String, dynamic>)
          : null,
      desktopPoster: json['desktopPoster'] is Map<String, dynamic>
          ? BannerMediaAsset.fromJson(json['desktopPoster'] as Map<String, dynamic>)
          : null,
      cta: json['cta'] is Map<String, dynamic>
          ? BannerCtaAction.fromJson(json['cta'] as Map<String, dynamic>)
          : null,
      autoplay: playback['autoplay'] != false && json['autoplay'] != false,
      loop: playback['loop'] != false && json['loop'] != false,
    );
  }

  /// Backward-compatible adapter from `home_banners/main_video` Firestore document.
  factory PublicBannerItem.fromLegacyHomeMainVideo(Map<String, dynamic> doc) {
    final mobileUrl = (doc['mobileVideoUrl'] ?? doc['videoUrl'] ?? '').toString();
    final desktopUrl = (doc['desktopVideoUrl'] ?? doc['videoUrl'] ?? '').toString();
    final mobilePosterUrl = (doc['mobilePosterUrl'] ?? doc['posterUrl'] ?? '').toString();
    final desktopPosterUrl = (doc['desktopPosterUrl'] ?? doc['posterUrl'] ?? '').toString();

    return PublicBannerItem(
      id: (doc['bannerId'] ?? 'main_video').toString(),
      pageType: 'home',
      pageId: null,
      placement: 'hero',
      title: (doc['title'] ?? '').toString(),
      subtitle: (doc['subtitle'] ?? '').toString(),
      mediaType: (doc['mediaType'] ?? 'video').toString(),
      sortOrder: 1,
      carouselEnabled: false,
      mobile: mobileUrl.isNotEmpty
          ? BannerMediaAsset(url: mobileUrl, mimeType: 'video/mp4')
          : null,
      desktop: desktopUrl.isNotEmpty
          ? BannerMediaAsset(url: desktopUrl, mimeType: 'video/mp4')
          : null,
      mobilePoster: mobilePosterUrl.isNotEmpty
          ? BannerMediaAsset(url: mobilePosterUrl, mimeType: 'image/webp')
          : null,
      desktopPoster: desktopPosterUrl.isNotEmpty
          ? BannerMediaAsset(url: desktopPosterUrl, mimeType: 'image/webp')
          : null,
      cta: doc['cta'] is Map<String, dynamic>
          ? BannerCtaAction.fromJson(doc['cta'] as Map<String, dynamic>)
          : null,
      autoplay: doc['autoplay'] != false,
      loop: doc['loop'] != false,
    );
  }
}
