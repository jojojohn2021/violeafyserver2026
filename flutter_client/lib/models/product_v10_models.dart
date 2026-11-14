// LeafyEarth | V10 AI Commerce & Product Discoverability (with V9 SEO Override)
// Cross-platform Flutter Models (Android, iOS, Web)

class ProductSEOContent {
  final String seoTitle;
  final String metaDescription;
  final List<String> seoKeywords;
  final String urlSlug;

  const ProductSEOContent({
    required this.seoTitle,
    required this.metaDescription,
    required this.seoKeywords,
    required this.urlSlug,
  });

  factory ProductSEOContent.fromJson(Map<String, dynamic> json) {
    return ProductSEOContent(
      seoTitle: (json['seoTitle'] ?? '').toString(),
      metaDescription: (json['metaDescription'] ?? '').toString(),
      seoKeywords: (json['seoKeywords'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      urlSlug: (json['urlSlug'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'seoTitle': seoTitle,
        'metaDescription': metaDescription,
        'seoKeywords': seoKeywords,
        'urlSlug': urlSlug,
      };
}

class ProductFAQItem {
  final String question;
  final String answer;

  const ProductFAQItem({
    required this.question,
    required this.answer,
  });

  factory ProductFAQItem.fromJson(Map<String, dynamic> json) {
    return ProductFAQItem(
      question: (json['question'] ?? '').toString(),
      answer: (json['answer'] ?? '').toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'question': question,
        'answer': answer,
      };
}

class ProductShippingDimensions {
  final double lengthCm;
  final double widthCm;
  final double heightCm;

  const ProductShippingDimensions({
    required this.lengthCm,
    required this.widthCm,
    required this.heightCm,
  });

  factory ProductShippingDimensions.fromJson(Map<String, dynamic> json) {
    return ProductShippingDimensions(
      lengthCm: (json['lengthCm'] as num?)?.toDouble() ?? 0.0,
      widthCm: (json['widthCm'] as num?)?.toDouble() ?? 0.0,
      heightCm: (json['heightCm'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() => {
        'lengthCm': lengthCm,
        'widthCm': widthCm,
        'heightCm': heightCm,
      };
}

class PublicProductProjection {
  final String offerId;
  final String productId;
  final String sku;
  final String title;
  final String description;
  final String brand;
  final String category;
  final String googleProductCategory;
  final String productType;
  final String urlSlug;
  final String canonicalUrl;
  final String imageLink;
  final List<String> additionalImageLinks;
  final double price;
  final double? salePrice;
  final String currency;
  final String availability; // 'in_stock' | 'out_of_stock' | 'preorder'
  final String condition; // 'new'
  final String? gtin;
  final String? mpn;
  final bool identifierExists;
  final double? netWeight;
  final String? netWeightUnit;
  final double? netVolume;
  final String? netVolumeUnit;
  final List<String> productHighlights;
  final List<ProductFAQItem> productFAQs;
  final List<String> dietaryAttributes;
  final String? allergenInformation;
  final String countryOfOrigin;
  final String seoTitle;
  final String metaDescription;
  final List<String> seoKeywords;
  final bool isAiGeneratedTitle;
  final bool isAiGeneratedDescription;
  final int revision;
  final String updatedAt;

  const PublicProductProjection({
    required this.offerId,
    required this.productId,
    required this.sku,
    required this.title,
    required this.description,
    required this.brand,
    required this.category,
    required this.googleProductCategory,
    required this.productType,
    required this.urlSlug,
    required this.canonicalUrl,
    required this.imageLink,
    required this.additionalImageLinks,
    required this.price,
    this.salePrice,
    required this.currency,
    required this.availability,
    required this.condition,
    this.gtin,
    this.mpn,
    required this.identifierExists,
    this.netWeight,
    this.netWeightUnit,
    this.netVolume,
    this.netVolumeUnit,
    required this.productHighlights,
    required this.productFAQs,
    required this.dietaryAttributes,
    this.allergenInformation,
    required this.countryOfOrigin,
    required this.seoTitle,
    required this.metaDescription,
    required this.seoKeywords,
    required this.isAiGeneratedTitle,
    required this.isAiGeneratedDescription,
    required this.revision,
    required this.updatedAt,
  });

  factory PublicProductProjection.fromJson(Map<String, dynamic> json) {
    return PublicProductProjection(
      offerId: (json['offerId'] ?? '').toString(),
      productId: (json['productId'] ?? '').toString(),
      sku: (json['sku'] ?? '').toString(),
      title: (json['title'] ?? '').toString(),
      description: (json['description'] ?? '').toString(),
      brand: (json['brand'] ?? 'LeafyEarth').toString(),
      category: (json['category'] ?? '').toString(),
      googleProductCategory: (json['googleProductCategory'] ?? '').toString(),
      productType: (json['productType'] ?? '').toString(),
      urlSlug: (json['urlSlug'] ?? '').toString(),
      canonicalUrl: (json['canonicalUrl'] ?? '').toString(),
      imageLink: (json['imageLink'] ?? '').toString(),
      additionalImageLinks: (json['additionalImageLinks'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      price: (json['price'] as num?)?.toDouble() ?? 0.0,
      salePrice: (json['salePrice'] as num?)?.toDouble(),
      currency: (json['currency'] ?? 'INR').toString(),
      availability: (json['availability'] ?? 'in_stock').toString(),
      condition: (json['condition'] ?? 'new').toString(),
      gtin: json['gtin']?.toString(),
      mpn: json['mpn']?.toString(),
      identifierExists: json['identifierExists'] == true,
      netWeight: (json['netWeight'] as num?)?.toDouble(),
      netWeightUnit: json['netWeightUnit']?.toString(),
      netVolume: (json['netVolume'] as num?)?.toDouble(),
      netVolumeUnit: json['netVolumeUnit']?.toString(),
      productHighlights: (json['productHighlights'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      productFAQs: (json['productFAQs'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(ProductFAQItem.fromJson)
          .toList(),
      dietaryAttributes: (json['dietaryAttributes'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      allergenInformation: json['allergenInformation']?.toString(),
      countryOfOrigin: (json['countryOfOrigin'] ?? 'India').toString(),
      seoTitle: (json['seoTitle'] ?? '').toString(),
      metaDescription: (json['metaDescription'] ?? '').toString(),
      seoKeywords: (json['seoKeywords'] as List<dynamic>? ?? const [])
          .map((e) => e.toString())
          .toList(),
      isAiGeneratedTitle: json['isAiGeneratedTitle'] == true,
      isAiGeneratedDescription: json['isAiGeneratedDescription'] == true,
      revision: (json['revision'] as num?)?.toInt() ?? 1,
      updatedAt: (json['updatedAt'] ?? '').toString(),
    );
  }
}
