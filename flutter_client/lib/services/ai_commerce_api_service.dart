// LeafyEarth | V10 AI Commerce & Product Discoverability
// Authenticated Backend API Service for Flutter (Android, iOS, Web)
// Never embeds OpenAI keys or merchant credentials on the client.

import 'dart:convert';
import '../models/product_v10_models.dart';

typedef HttpHandler = Future<Map<String, dynamic>> Function(
  String method,
  String path, {
  Map<String, dynamic>? body,
  Map<String, String>? headers,
});

class SlugResolutionResult {
  final int statusCode; // 200, 301, 404
  final String? redirectToSlug;
  final PublicProductProjection? product;

  const SlugResolutionResult({
    required this.statusCode,
    this.redirectToSlug,
    this.product,
  });
}

class AICommerceApiService {
  final String baseUrl;
  final HttpHandler httpHandler;
  final Future<String?> Function()? getFirebaseIdToken;

  AICommerceApiService({
    required this.baseUrl,
    required this.httpHandler,
    this.getFirebaseIdToken,
  });

  Future<Map<String, String>> _buildAuthHeaders() async {
    final headers = <String, String>{
      'Content-Type': 'application/json',
    };
    if (getFirebaseIdToken != null) {
      final token = await getFirebaseIdToken!();
      if (token != null && token.isNotEmpty) {
        headers['Authorization'] = 'Bearer $token';
      }
    }
    return headers;
  }

  /// Resolves `/products/:slugOrId` via public allowlisted API.
  Future<SlugResolutionResult> resolveProductBySlugOrId(String slugOrId) async {
    final encoded = Uri.encodeComponent(slugOrId.trim());
    final res = await httpHandler(
      'GET',
      '$baseUrl/api/v1/public/products/$encoded',
    );
    final status = (res['statusCode'] as num?)?.toInt() ?? 200;
    if (status == 404 || res['ok'] == false) {
      return const SlugResolutionResult(statusCode: 404);
    }
    final redirectSlug = res['redirectToSlug']?.toString();
    final productMap = res['product'] as Map<String, dynamic>?;
    return SlugResolutionResult(
      statusCode: redirectSlug != null && redirectSlug.isNotEmpty ? 301 : 200,
      redirectToSlug: redirectSlug,
      product: productMap != null ? PublicProductProjection.fromJson(productMap) : null,
    );
  }

  /// Generates V9 SEO metadata for a staged AI product draft.
  Future<ProductSEOContent> generateDraftSEO(String draftId) async {
    final headers = await _buildAuthHeaders();
    final res = await httpHandler(
      'POST',
      '$baseUrl/api/admin/ai-products/$draftId/seo/generate',
      headers: headers,
      body: const {},
    );
    return ProductSEOContent.fromJson(
      (res['seo'] as Map<String, dynamic>?) ?? const {},
    );
  }

  /// Saves edited V9 SEO fields to staging.
  Future<ProductSEOContent> saveDraftSEO(String draftId, ProductSEOContent seo) async {
    final headers = await _buildAuthHeaders();
    final res = await httpHandler(
      'PATCH',
      '$baseUrl/api/admin/ai-products/$draftId/seo',
      headers: headers,
      body: {'seo': seo.toJson()},
    );
    return ProductSEOContent.fromJson(
      (res['seo'] as Map<String, dynamic>?) ?? seo.toJson(),
    );
  }

  /// Approves V9 SEO metadata in staging.
  Future<void> approveDraftSEO(String draftId) async {
    final headers = await _buildAuthHeaders();
    await httpHandler(
      'POST',
      '$baseUrl/api/admin/ai-products/$draftId/seo/approve',
      headers: headers,
      body: {'action': 'APPROVE'},
    );
  }

  /// Applies approved V9 SEO & reserves `productSlugs/{slug}` transactionally.
  Future<Map<String, dynamic>> applyDraftSEOToMaster({
    required String draftId,
    required String masterProductId,
    int? expectedMasterRevision,
  }) async {
    final headers = await _buildAuthHeaders();
    return httpHandler(
      'POST',
      '$baseUrl/api/admin/ai-products/$draftId/seo/apply',
      headers: headers,
      body: {
        'masterProductId': masterProductId,
        'selectedFields': const ['seoTitle', 'metaDescription', 'seoKeywords', 'urlSlug'],
        if (expectedMasterRevision != null) 'expectedMasterRevision': expectedMasterRevision,
      },
    );
  }

  /// Generates V10 AI Commerce draft for a product.
  Future<Map<String, dynamic>> generateAICommerceDraft(String productId) async {
    final headers = await _buildAuthHeaders();
    return httpHandler(
      'POST',
      '$baseUrl/api/admin/ai-commerce/products/$productId/generate',
      headers: headers,
      body: const {},
    );
  }

  /// Applies approved V10 AI Commerce fields to Master & publishes allowlisted projection.
  Future<Map<String, dynamic>> applyAICommerceToMaster({
    required String productId,
    bool enableAICommerce = true,
  }) async {
    final headers = await _buildAuthHeaders();
    return httpHandler(
      'POST',
      '$baseUrl/api/admin/ai-commerce/products/$productId/apply',
      headers: headers,
      body: {'enableAICommerce': enableAICommerce},
    );
  }

  String encodePrettyJson(Map<String, dynamic> data) =>
      const JsonEncoder.withIndent('  ').convert(data);
}
