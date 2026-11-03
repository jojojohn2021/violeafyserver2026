import { adminDb } from '../firebase-admin';
import {
  reconcileAllReviewAggregates,
  CUSTOMER_REVIEWS_COLLECTION,
  CUSTOMER_REVIEW_AGGREGATES_COLLECTION,
} from '../src/services/customerReviewService';

async function main() {
  console.log(
    `[RECONCILE] Auditing '${CUSTOMER_REVIEWS_COLLECTION}' and '${CUSTOMER_REVIEW_AGGREGATES_COLLECTION}'...`
  );
  const result = await reconcileAllReviewAggregates(adminDb);
  console.log(
    JSON.stringify(
      {
        status: 'COMPLETED',
        totalReviewsScanned: result.totalReviewsScanned,
        eligiblePublishedReviews: result.eligiblePublishedReviews,
        productsUpdated: result.productsUpdated,
        aggregates: result.aggregates,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[RECONCILE] Fatal error:', err);
  process.exit(1);
});
