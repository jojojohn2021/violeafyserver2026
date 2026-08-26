import React, { useState, useRef } from 'react';
import { ProductPerformance, ProductReview, User } from '../types';
import { Star, UploadCloud, Trash2, Image, Video, MessageSquare, CheckCircle2 } from 'lucide-react';
import { uploadFileToStorage } from '../utils/storageUpload';

interface ProductReviewsSectionProps {
  product: ProductPerformance;
  updateProduct: (id: string, updates: Partial<ProductPerformance>) => void;
  productReviews: ProductReview[];
  addProductReview: (review: Omit<ProductReview, 'id' | 'createdAt'>) => void;
  currentUser: User | null;
}

export default function ProductReviewsSection({
  product,
  updateProduct,
  productReviews,
  addProductReview,
  currentUser
}: ProductReviewsSectionProps) {
  const reviews = productReviews.filter(r => r.productId === product.id);

  // Form states
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [videos, setVideos] = useState<string[]>([]);
  const [hoveredStar, setHoveredStar] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const processImage = async (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return;
    const { downloadUrl } = await uploadFileToStorage(file, `reviews/${product.id}/image-${crypto.randomUUID()}`);
    setPhotos(prev => [...prev, downloadUrl]);
  };

  const processVideo = async (file: File) => {
    if (!file.type.startsWith('video/') || file.size > 50 * 1024 * 1024) {
      alert('Video file is too large. Please upload a short video under 20MB.');
      return;
    }
    const { downloadUrl } = await uploadFileToStorage(file, `reviews/${product.id}/video-${crypto.randomUUID()}`);
    setVideos(prev => [...prev, downloadUrl]);
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(processImage);
    }
  };

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(processVideo);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== index));
  };

  const removeVideo = (index: number) => {
    setVideos(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmitReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!comment.trim()) {
      alert('Please enter a review comment.');
      return;
    }

    setIsSubmitting(true);

    const userName = currentUser?.name || 'Anonymous Customer';
    const userId = currentUser?.id || 'guest-user';

    // 1. Save review in CRM Store
    addProductReview({
      productId: product.id,
      userId,
      userName,
      rating,
      comment: comment.trim(),
      photos: photos.length > 0 ? photos : undefined,
      videos: videos.length > 0 ? videos : undefined
    });

    // 2. Calculate and update product average ratings and reviewsCount
    const currentReviews = productReviews.filter(r => r.productId === product.id);
    const newCount = currentReviews.length + 1;
    const totalRatingSum = currentReviews.reduce((sum, r) => sum + r.rating, 0) + rating;
    const newAvgRating = parseFloat((totalRatingSum / newCount).toFixed(1));

    updateProduct(product.id, {
      reviewsCount: newCount,
      rating: newAvgRating
    });

    // Reset Form
    setComment('');
    setRating(5);
    setPhotos([]);
    setVideos([]);
    setIsSubmitting(false);
    setSuccessMessage('Thank you! Your customer review was added successfully.');
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  return (
    <div className="md:col-span-4 mt-6 border-t border-slate-800/80 pt-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-indigo-400" />
            Customer Reviews ({reviews.length})
          </h4>
          <p className="text-[11px] text-slate-400 mt-1">
            Linked directly to the customer reviews catalog. Real-time ratings synchronize with the Product Master Table.
          </p>
        </div>
        <div className="flex items-center gap-2 bg-[#0c0c0e] px-3 py-1.5 rounded-lg border border-slate-800/60 self-start sm:self-auto">
          <span className="text-xs text-slate-400 font-medium">Average Rating:</span>
          <span className="text-xs font-bold text-yellow-500 flex items-center gap-1 font-mono">
            {product.rating !== undefined ? product.rating : '5.0'} ⭐
          </span>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-900/60 text-emerald-400 rounded-lg text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Grid: 1. Reviews list, 2. Add Review form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Review list */}
        <div className="lg:col-span-7 space-y-4 max-h-[480px] overflow-y-auto pr-1">
          {reviews.length === 0 ? (
            <div className="text-center py-10 bg-[#0d0d10]/40 border border-slate-800/40 rounded-xl">
              <span className="text-xs text-slate-500">No reviews have been written for this product yet.</span>
            </div>
          ) : (
            reviews.map((rev) => (
              <div 
                key={rev.id} 
                className="bg-[#0d0d10] border border-slate-800/60 rounded-xl p-4 space-y-3 hover:border-slate-800 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-200 block">{rev.userName}</span>
                    <span className="text-[9px] text-slate-500 block font-mono">
                      {new Date(rev.createdAt).toLocaleDateString(undefined, { 
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                      })}
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star 
                        key={i} 
                        className={`w-3.5 h-3.5 ${i < rev.rating ? 'fill-yellow-500 text-yellow-500' : 'text-slate-700'}`} 
                      />
                    ))}
                  </div>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{rev.comment}</p>

                {/* Attached photos */}
                {rev.photos && rev.photos.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Attached Photos:</span>
                    <div className="flex flex-wrap gap-2">
                      {rev.photos.map((photo, pIdx) => (
                        <img 
                          key={pIdx}
                          src={photo}
                          alt="Review attachment"
                          referrerPolicy="no-referrer"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-800 bg-[#070709] hover:scale-105 transition cursor-pointer"
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Attached videos */}
                {rev.videos && rev.videos.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Attached Short Videos:</span>
                    <div className="flex flex-wrap gap-3">
                      {rev.videos.map((vid, vIdx) => (
                        <video 
                          key={vIdx}
                          src={vid}
                          controls
                          className="w-48 h-28 object-cover rounded-lg border border-slate-800 bg-black"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Add Review Form */}
        <div className="lg:col-span-5 bg-[#0d0d10] border border-slate-800 rounded-xl p-5 space-y-4">
          <h5 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Write a Customer Review</h5>
          
          <form onSubmit={handleSubmitReview} className="space-y-4">
            {/* Star Rating Selector */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Product Rating:</label>
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => {
                  const starVal = i + 1;
                  const isActive = hoveredStar !== null ? starVal <= hoveredStar : starVal <= rating;
                  return (
                    <button
                      type="button"
                      key={i}
                      onMouseEnter={() => setHoveredStar(starVal)}
                      onMouseLeave={() => setHoveredStar(null)}
                      onClick={() => setRating(starVal)}
                      className="focus:outline-none transition-transform active:scale-95 cursor-pointer"
                    >
                      <Star 
                        className={`w-6 h-6 ${isActive ? 'fill-yellow-500 text-yellow-500' : 'text-slate-800'}`} 
                      />
                    </button>
                  );
                })}
                <span className="text-xs font-mono font-bold text-slate-400 ml-2">({rating}.0 / 5.0)</span>
              </div>
            </div>

            {/* Comment */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Your Review / Comment:</label>
              <textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="What did you think of this product? Share ingredients, packing size, shipping speed, etc."
                rows={3}
                className="w-full text-xs p-2.5 bg-[#141418] border border-slate-800 text-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                required
              />
            </div>

            {/* Photos & Videos Upload Fields */}
            <div className="grid grid-cols-2 gap-3">
              {/* Photo Input Button */}
              <div>
                <input 
                  type="file"
                  accept="image/*"
                  multiple
                  ref={photoInputRef}
                  onChange={handlePhotoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-full py-2 px-3 border border-dashed border-slate-800 hover:border-slate-700 bg-[#141418] text-slate-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  <Image className="w-3.5 h-3.5 text-indigo-400" />
                  Add Photos
                </button>
              </div>

              {/* Video Input Button */}
              <div>
                <input 
                  type="file"
                  accept="video/*"
                  multiple
                  ref={videoInputRef}
                  onChange={handleVideoChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => videoInputRef.current?.click()}
                  className="w-full py-2 px-3 border border-dashed border-slate-800 hover:border-slate-700 bg-[#141418] text-slate-300 hover:text-white rounded-lg flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  <Video className="w-3.5 h-3.5 text-amber-500" />
                  Add Videos
                </button>
              </div>
            </div>

            {/* Form Upload Previews */}
            {(photos.length > 0 || videos.length > 0) && (
              <div className="space-y-3 bg-[#111114] p-3 rounded-lg border border-slate-800/60">
                {/* Photo Previews */}
                {photos.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Photos Added:</span>
                    <div className="flex flex-wrap gap-1.5">
                      {photos.map((photo, idx) => (
                        <div key={idx} className="relative group w-12 h-12">
                          <img 
                            src={photo} 
                            alt="Preview" 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover rounded border border-slate-800" 
                          />
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="absolute -top-1 -right-1 bg-rose-600 text-white p-0.5 rounded-full hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition duration-150"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Video Previews */}
                {videos.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Videos Added:</span>
                    <div className="flex flex-wrap gap-2">
                      {videos.map((vid, idx) => (
                        <div key={idx} className="relative group w-32 h-18">
                          <video 
                            src={vid} 
                            className="w-full h-full object-cover rounded border border-slate-800 bg-black" 
                          />
                          <button
                            type="button"
                            onClick={() => removeVideo(idx)}
                            className="absolute -top-1 -right-1 bg-rose-600 text-white p-0.5 rounded-full hover:bg-rose-500 opacity-0 group-hover:opacity-100 transition duration-150 z-10"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Submitting review...' : 'Submit Customer Review'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
