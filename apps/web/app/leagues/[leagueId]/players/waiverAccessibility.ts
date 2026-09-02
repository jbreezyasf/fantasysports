export type WaiverReview = {
  addLabel: string;
  dropLabel?: string | null;
  clearsAt: string;
  source?: string | null;
  faabEnabled: boolean;
  faabAmount?: number | null;
};

export function waiverReviewAnnouncement(review: WaiverReview) {
  return [
    `Review waiver claim for ${review.addLabel}`,
    `Drop player ${review.dropLabel || 'none selected'}`,
    review.faabEnabled ? `FAAB amount ${review.faabAmount ?? 0}` : 'FAAB amount not used by this league',
    `Processing information: clears ${review.clearsAt}${review.source ? `, from ${review.source}` : ''}`
  ].join('. ');
}
