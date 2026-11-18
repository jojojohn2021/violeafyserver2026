// LeafyEarth V9/V10 Cross-Platform Product Deep-Link & SEO Router (Android, Web, iOS)
// Resolves `/products/:slug` and `/p/:productId`, follows `productSlugs` redirect aliases,
// and synchronizes Web SEO metadata (`seoTitle`, `metaDescription`, `seoKeywords`, `urlSlug`).

import '../models/product_seo_commerce.dart';

class ProductRouteResolution {
  final int statusCode; // 200, 301, or 404
  final String? redirectCanonicalSlug;
  final PublicProductProjection? product;

  const ProductRouteResolution({
    required this.statusCode,
    this.redirectCanonicalSlug,
    this.product,
  });
}

typedef FirestoreDocFetcher = Future<Map<String, dynamic>?> Function(
  String collection,
  String docId,
);

class LeafyEarthProductDeepLinkRouter {
  final FirestoreDocFetcher fetchDoc;
  final String verifiedDomain;

  const LeafyEarthProductDeepLinkRouter({
    required this.fetchDoc,
    this.verifiedDomain = 'https://vionaturescience.in',
  });

  /// Parses incoming Android App Link, iOS Universal Link, or Web path (`/products/:slug` or `/p/:productId`).
  static String? extractSlugOrIdFromUri(Uri uri) {
    final segments = uri.pathSegments.where((s) => s.isNotEmpty).toList();
    if (segments.length == 2 &&
        (segments[0].toLowerCase() == 'products' || segments[0].toLowerCase() == 'p')) {
      return Uri.decodeComponent(segments[1]).trim();
    }
    return null;
  }

  /// Resolves a product slug or ID against `productSlugs` and `public_products` / `products`.
  Future<ProductRouteResolution> resolveProductUri(Uri uri) async {
    final slugOrId = extractSlugOrIdFromUri(uri);
    if (slugOrId == null || slugOrId.isEmpty) {
      return const ProductRouteResolution(statusCode: 404);
    }

    final normalizedSlug = slugOrId.toLowerCase();
    final slugData = await fetchDoc('productSlugs', normalizedSlug);
    if (slugData != null) {
      final reservation = ProductSlugReservation.fromMap(normalizedSlug, slugData);
      if (reservation.isRedirect && reservation.canonicalSlug != normalizedSlug) {
        final targetDoc = await fetchDoc('public_products', reservation.productId) ??
            await fetchDoc('products', reservation.productId);
        return ProductRouteResolution(
          statusCode: 301,
          redirectCanonicalSlug: reservation.canonicalSlug,
          product: targetDoc != null
              ? PublicProductProjection.fromFirestore(reservation.productId, targetDoc)
              : null,
        );
      }

      final prodDoc = await fetchDoc('public_products', reservation.productId) ??
          await fetchDoc('products', reservation.productId);
      if (prodDoc != null) {
        return ProductRouteResolution(
          statusCode: 200,
          product: PublicProductProjection.fromFirestore(reservation.productId, prodDoc),
        );
      }
    }

    // Fallback to direct product ID lookup
    final directDoc =
        await fetchDoc('public_products', slugOrId) ?? await fetchDoc('products', slugOrId);
    if (directDoc != null) {
      final product = PublicProductProjection.fromFirestore(slugOrId, directDoc);
      if (product.seo.urlSlug.isNotEmpty && product.seo.urlSlug != normalizedSlug) {
        return ProductRouteResolution(
          statusCode: 301,
          redirectCanonicalSlug: product.seo.urlSlug,
          product: product,
        );
      }
      return ProductRouteResolution(statusCode: 200, product: product);
    }

    return const ProductRouteResolution(statusCode: 404);
  }
}
