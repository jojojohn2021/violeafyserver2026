// LeafyEarth V9/V10 Flutter Cross-Platform (Android, Web, iOS) SEO & AI Commerce Models
// Maps Firestore `products`, `productSlugs`, and `public_products` documents.

class ProductFAQItem {
  final String question;
  final String answer;

  const ProductFAQItem({
    required this.question,
    required this.answer,
  });

  factory ProductFAQItem.fromMap(Map<String, dynamic> map) {
    return ProductFAQItem(
      question: (map['question'] ?? '').toString().trim(),
      answer: (map['answer'] ?? '').toString().trim(),
    );
  }

  Map<String, dynamic> toMap() => {
        'question': question,
        'answer': answer,
      };
}

class ProductSEOContent {
  final String seoTitle;
  final String metaDescription;
  final List<String> seoKeywords;
  final String urlSlug;
  final String? canonicalUrl;

  const ProductSEOContent({
    required this.seoTitle,
    required this.metaDescription,
    required this.seoKeywords,
    required this.urlSlug,
    this.canonicalUrl,
  });

  factory ProductSEOContent.fromMap(Map<String, dynamic> map, {String defaultDomain = 'https://vionaturescience.in'}) {
    final slug = (map['urlSlug'] ?? map['url_slug'] ?? '').toString().trim().toLowerCase();
    final rawKeywords = map['seoKeywords'] ?? map['seo_keywords'];
    final keywords = rawKeywords is Iterable
        ? rawKeywords.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList()
        : <String>[];

    return ProductSEOContent(
      seoTitle: (map['seoTitle'] ?? map['seo_title'] ?? map['title'] ?? map['name'] ?? '').toString().trim(),
      metaDescription: (map['metaDescription'] ?? map['meta_description'] ?? map['description'] ?? '').toString().trim(),
      seoKeywords: keywords,
      urlSlug: slug,
      canonicalUrl: map['canonicalUrl']?.toString() ??
          (slug.isNotEmpty ? '${defaultDomain.replaceAll(RegExp(r'/+$'), '')}/products/$slug' : null),
    );
  }

  Map<String, dynamic> toMap() => {
        'seoTitle': seoTitle,
        'metaDescription': metaDescription,
        'seoKeywords': seoKeywords,
        'urlSlug': urlSlug,
        if (canonicalUrl != null) 'canonicalUrl': canonicalUrl,
      };
}

class ProductSlugReservation {
  final String slug;
  final String productId;
  final String state; // 'active' | 'redirect'
  final String? canonicalSlug;

  const ProductSlugReservation({
    required this.slug,
    required this.productId,
    required this.state,
    this.canonicalSlug,
  });

  bool get isRedirect => state == 'redirect' && canonicalSlug != null && canonicalSlug!.isNotEmpty;

  factory ProductSlugReservation.fromMap(String docId, Map<String, dynamic> map) {
    return ProductSlugReservation(
      slug: (map['slug'] ?? docId).toString().trim().toLowerCase(),
      productId: (map['productId'] ?? '').toString().trim(),
      state: (map['state'] ?? 'active').toString().trim(),
      canonicalSlug: map['canonicalSlug']?.toString().trim().toLowerCase(),
    );
  }
}

class PublicProductProjection {
  final String id;
  final String productId;
  final String sku;
  final String title;
  final String description;
  final String imageUrl;
  final List<String> additionalImageUrls;
  final double price;
  final double? salePrice;
  final double mrp;
  final String currency;
  final String availability;
  final String brand;
  final String category;
  final String? leafycategory;
  final bool featuredproducts;
  final int featuredprdsortorder;
  final String? aiContentLink;
  final String? aiDraftId;
  final ProductSEOContent seo;
  final List<String> productHighlights;
  final List<ProductFAQItem> productFAQs;

  const PublicProductProjection({
    required this.id,
    required this.productId,
    required this.sku,
    required this.title,
    required this.description,
    required this.imageUrl,
    required this.additionalImageUrls,
    required this.price,
    this.salePrice,
    required this.mrp,
    this.currency = 'INR',
    required this.availability,
    required this.brand,
    required this.category,
    this.leafycategory,
    this.featuredproducts = false,
    this.featuredprdsortorder = 1,
    this.aiContentLink,
    this.aiDraftId,
    required this.seo,
    this.productHighlights = const [],
    this.productFAQs = const [],
  });

  factory PublicProductProjection.fromFirestore(String docId, Map<String, dynamic> map) {
    final highlights = (map['productHighlights'] is Iterable)
        ? (map['productHighlights'] as Iterable).map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList()
        : <String>[];
    final faqs = (map['productFAQs'] is Iterable)
        ? (map['productFAQs'] as Iterable)
            .whereType<Map>()
            .map((m) => ProductFAQItem.fromMap(Map<String, dynamic>.from(m)))
            .toList()
        : <ProductFAQItem>[];
    final gallery = (map['additionalImageUrls'] ?? map['images']);
    final galleryUrls = gallery is Iterable
        ? gallery.map((e) => e.toString().trim()).where((s) => s.isNotEmpty).toList()
        : <String>[];

    return PublicProductProjection(
      id: docId,
      productId: (map['productId'] ?? docId).toString(),
      sku: (map['sku'] ?? '').toString(),
      title: (map['title'] ?? map['name'] ?? '').toString(),
      description: (map['description'] ?? '').toString(),
      imageUrl: (map['imageUrl'] ?? '').toString(),
      additionalImageUrls: galleryUrls,
      price: (map['price'] ?? map['onlinePrice'] ?? 0 as num).toDouble(),
      salePrice: map['salePrice'] != null ? (map['salePrice'] as num).toDouble() : null,
      mrp: (map['mrp'] ?? map['shopPrice'] ?? 0 as num).toDouble(),
      currency: (map['currency'] ?? 'INR').toString(),
      availability: (map['availability'] ?? map['stockAvailability'] ?? 'in_stock').toString(),
      brand: (map['brand'] ?? 'LeafyEarth').toString(),
      category: (map['category'] ?? 'Uncategorized').toString(),
      leafycategory: map['leafycategory']?.toString(),
      featuredproducts: map['featuredproducts'] == true,
      featuredprdsortorder: (map['featuredprdsortorder'] is num) ? (map['featuredprdsortorder'] as num).toInt() : 1,
      aiContentLink: map['aiContentLink']?.toString(),
      aiDraftId: map['aiDraftId']?.toString(),
      seo: ProductSEOContent.fromMap(map),
      productHighlights: highlights,
      productFAQs: faqs,
    );
  }
}
