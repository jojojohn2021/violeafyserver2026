// LeafyEarth | V9 & V10 Canonical Product Slug Router & Deep Link Handler
// Supports `/products/<urlSlug>` and legacy `/products/<productId>` across Flutter Web, Android App Links, and iOS Universal Links.

import '../models/product_v10_models.dart';
import '../services/ai_commerce_api_service.dart';

class ProductRouteMatch {
  final String requestedSlugOrId;
  final String canonicalPath;
  final bool wasRedirected;
  final bool isNotFound;
  final PublicProductProjection? product;

  const ProductRouteMatch({
    required this.requestedSlugOrId,
    required this.canonicalPath,
    required this.wasRedirected,
    required this.isNotFound,
    this.product,
  });
}

class ProductSlugRouter {
  static final RegExp _productRoutePattern = RegExp(r'^/products/([^/?#]+)$');

  final AICommerceApiService apiService;
  final void Function(String newPath)? onReplaceBrowserUrl;
  final void Function(String title)? onUpdateDocumentTitle;

  const ProductSlugRouter({
    required this.apiService,
    this.onReplaceBrowserUrl,
    this.onUpdateDocumentTitle,
  });

  /// Parses an incoming path or full deep-link URI (`https://leafyearth.com/products/cumin-seeds-jeera-whole`)
  static String? extractSlugOrId(String uriOrPath) {
    final uri = Uri.tryParse(uriOrPath.trim());
    if (uri == null) return null;
    final match = _productRoutePattern.firstMatch(uri.path);
    if (match == null) return null;
    return Uri.decodeComponent(match.group(1)!);
  }

  /// Builds the canonical share URL for a product (`https://leafyearth.com/products/<urlSlug>`)
  static String buildCanonicalProductUrl(
    PublicProductProjection product, {
    String baseOrigin = 'https://leafyearth.com',
  }) {
    final cleanOrigin = baseOrigin.replaceAll(RegExp(r'/+$'), '');
    final slug = product.urlSlug.isNotEmpty ? product.urlSlug : product.productId;
    return '$cleanOrigin/products/$slug';
  }

  /// Resolves a `/products/:slugOrId` route, handling 301 redirect aliases and 404 missing products.
  Future<ProductRouteMatch> resolveRoute(String uriOrPath) async {
    final slugOrId = extractSlugOrId(uriOrPath);
    if (slugOrId == null || slugOrId.isEmpty) {
      return const ProductRouteMatch(
        requestedSlugOrId: '',
        canonicalPath: '/404',
        wasRedirected: false,
        isNotFound: true,
      );
    }

    final res = await apiService.resolveProductBySlugOrId(slugOrId);
    if (res.statusCode == 404 || res.product == null) {
      onUpdateDocumentTitle?.call('Product Not Found | LeafyEarth');
      return ProductRouteMatch(
        requestedSlugOrId: slugOrId,
        canonicalPath: '/products/$slugOrId',
        wasRedirected: false,
        isNotFound: true,
      );
    }

    final product = res.product!;
    final canonicalSlug =
        (res.redirectToSlug != null && res.redirectToSlug!.isNotEmpty)
            ? res.redirectToSlug!
            : product.urlSlug;
    final canonicalPath = '/products/$canonicalSlug';
    final wasRedirected = canonicalSlug != slugOrId;

    if (wasRedirected) {
      onReplaceBrowserUrl?.call(canonicalPath);
    }
    onUpdateDocumentTitle?.call(
      product.seoTitle.isNotEmpty ? product.seoTitle : '${product.title} | LeafyEarth',
    );

    return ProductRouteMatch(
      requestedSlugOrId: slugOrId,
      canonicalPath: canonicalPath,
      wasRedirected: wasRedirected,
      isNotFound: false,
      product: product,
    );
  }
}
