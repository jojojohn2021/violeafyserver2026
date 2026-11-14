// LeafyEarth | V10 AI Commerce & Product Discoverability Screen Descriptor
// Provides view-model state for Flutter Admin & Storefront product screens.

import '../models/product_v10_models.dart';
import '../routing/product_slug_router.dart';
import '../services/ai_commerce_api_service.dart';

class AICommerceDiscoverabilityViewModel {
  final AICommerceApiService apiService;

  bool isLoading = false;
  String? errorMessage;
  String? statusMessage;
  PublicProductProjection? activeProjection;
  ProductSEOContent? stagedSeo;

  AICommerceDiscoverabilityViewModel({required this.apiService});

  Future<void> loadPublicProductBySlugOrId(String slugOrId) async {
    isLoading = true;
    errorMessage = null;
    try {
      final router = ProductSlugRouter(apiService: apiService);
      final match = await router.resolveRoute('/products/$slugOrId');
      if (match.isNotFound || match.product == null) {
        activeProjection = null;
        errorMessage = 'Product not found (404) for /products/$slugOrId';
      } else {
        activeProjection = match.product;
        statusMessage = match.wasRedirected
            ? 'Redirected (301) to canonical URL ${match.canonicalPath}'
            : 'Loaded canonical product ${match.canonicalPath}';
      }
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
    }
  }

  Future<void> generateAndApproveSEO({
    required String draftId,
    required String masterProductId,
  }) async {
    isLoading = true;
    errorMessage = null;
    try {
      stagedSeo = await apiService.generateDraftSEO(draftId);
      await apiService.approveDraftSEO(draftId);
      await apiService.applyDraftSEOToMaster(
        draftId: draftId,
        masterProductId: masterProductId,
      );
      statusMessage = 'Published V9 SEO & canonical slug /products/${stagedSeo?.urlSlug}';
    } catch (e) {
      errorMessage = e.toString();
    } finally {
      isLoading = false;
    }
  }
}
