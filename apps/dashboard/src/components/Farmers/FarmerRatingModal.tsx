import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Star, Send, Sparkles } from 'lucide-react';
import { clsx } from 'clsx';
import { useFarmerGroupStore } from '@/store/farmerGroupStore';

interface FarmerRatingModalProps {
  isOpen: boolean;
  onClose: () => void;
  farmerId: string;
  farmerName: string;
  farmerIcon?: string;
  farmId?: string;
  onRatingSubmitted?: (rating: number) => void;
}

export const FarmerRatingModal: React.FC<FarmerRatingModalProps> = ({
  isOpen,
  onClose,
  farmerId,
  farmerName,
  farmerIcon,
  farmId,
  onRatingSubmitted,
}) => {
  const [rating, setRating] = useState<number>(0);
  const [hoveredRating, setHoveredRating] = useState<number>(0);
  const [review, setReview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { addRating } = useFarmerGroupStore();

  const handleSubmit = async () => {
    if (rating === 0) return;

    setIsSubmitting(true);
    try {
      await addRating(farmerId, rating, farmId, review.trim() || undefined);
      setSubmitted(true);
      onRatingSubmitted?.(rating);

      // Close after showing success
      setTimeout(() => {
        onClose();
        // Reset state for next use
        setRating(0);
        setReview('');
        setSubmitted(false);
      }, 1500);
    } catch (error) {
      console.error('[FarmerRatingModal] Failed to submit rating:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    onClose();
    setRating(0);
    setReview('');
  };

  const displayRating = hoveredRating || rating;

  const ratingLabels = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && handleSkip()}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Success State */}
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.1 }}
                  className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center"
                >
                  <Sparkles className="w-10 h-10 text-white" />
                </motion.div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                  Thank You!
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  Your feedback helps improve our farmers
                </p>
              </motion.div>
            ) : (
              <>
                {/* Header */}
                <div className="relative p-6 pb-4 bg-gradient-to-br from-primary-500 to-primary-600">
                  <button
                    onClick={handleSkip}
                    className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <X className="w-4 h-4 text-white" />
                  </button>

                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center text-3xl">
                      {farmerIcon || '🌾'}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">
                        Rate Your Experience
                      </h2>
                      <p className="text-white/80 text-sm">
                        How was {farmerName}?
                      </p>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                  {/* Star Rating */}
                  <div className="text-center">
                    <div className="flex justify-center space-x-2 mb-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <motion.button
                          key={star}
                          onClick={() => setRating(star)}
                          onMouseEnter={() => setHoveredRating(star)}
                          onMouseLeave={() => setHoveredRating(0)}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.95 }}
                          className="p-1 focus:outline-none"
                        >
                          <Star
                            className={clsx(
                              'w-10 h-10 transition-colors duration-150',
                              star <= displayRating
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300 dark:text-gray-600'
                            )}
                          />
                        </motion.button>
                      ))}
                    </div>
                    <motion.p
                      key={displayRating}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm font-medium text-gray-600 dark:text-gray-400 h-5"
                    >
                      {displayRating > 0 ? ratingLabels[displayRating] : 'Tap to rate'}
                    </motion.p>
                  </div>

                  {/* Review Input (shown after rating) */}
                  <AnimatePresence>
                    {rating > 0 && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Share your experience (optional)
                        </label>
                        <textarea
                          value={review}
                          onChange={(e) => setReview(e.target.value)}
                          placeholder="What did you like? Any suggestions?"
                          rows={3}
                          className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none text-gray-900 dark:text-white placeholder-gray-400"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Actions */}
                  <div className="flex space-x-3">
                    <button
                      onClick={handleSkip}
                      className="flex-1 px-4 py-3 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl transition-colors font-medium"
                    >
                      Skip
                    </button>
                    <motion.button
                      onClick={handleSubmit}
                      disabled={rating === 0 || isSubmitting}
                      whileHover={{ scale: rating > 0 ? 1.02 : 1 }}
                      whileTap={{ scale: rating > 0 ? 0.98 : 1 }}
                      className={clsx(
                        'flex-1 px-4 py-3 rounded-xl font-medium flex items-center justify-center space-x-2 transition-all',
                        rating > 0
                          ? 'bg-gradient-to-r from-primary-500 to-primary-600 text-white shadow-lg shadow-primary-500/30'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      {isSubmitting ? (
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span>Submit</span>
                        </>
                      )}
                    </motion.button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default FarmerRatingModal;
