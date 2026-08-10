import React from 'react';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

/**
 * Primitive Skeleton component with pulse animation
 */
export const Skeleton: React.FC<SkeletonProps> = ({ className = '', ...props }) => {
  return (
    <div
      className={`animate-pulse bg-slate-700/60 rounded-xl ${className}`}
      {...props}
    />
  );
};

/**
 * Skeleton loader matching PropertyCard component layout
 */
export const PropertyCardSkeleton: React.FC = () => {
  return (
    <div className="bg-[#252A34]/90 rounded-2xl border border-white/10 overflow-hidden shadow-lg flex flex-col h-full">
      {/* Property Image Placeholder */}
      <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-slate-800 p-3 flex flex-col justify-between">
        <div className="flex justify-between items-center">
          <Skeleton className="w-20 h-5 rounded-full" />
          <Skeleton className="w-8 h-8 rounded-full" />
        </div>
        <Skeleton className="w-24 h-4 rounded-md" />
      </div>

      {/* Property Info Placeholder */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between space-y-4">
        <div className="space-y-2">
          {/* Price */}
          <Skeleton className="w-32 h-6" />
          {/* Title */}
          <Skeleton className="w-3/4 h-5" />
          {/* Location */}
          <Skeleton className="w-1/2 h-4" />
        </div>

        {/* Specs (Bed, Bath, Type) */}
        <div className="flex items-center gap-4 pt-2 border-t border-white/5">
          <Skeleton className="w-12 h-4" />
          <Skeleton className="w-12 h-4" />
          <Skeleton className="w-16 h-4" />
        </div>

        {/* CTA Button Placeholder */}
        <div className="pt-2">
          <Skeleton className="w-full h-10 rounded-xl" />
        </div>
      </div>
    </div>
  );
};

/**
 * Grid of PropertyCard Skeletons
 */
export const PropertyGridSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, index) => (
        <PropertyCardSkeleton key={index} />
      ))}
    </div>
  );
};

/**
 * Skeleton loader for Dashboard views (Landlord / Tenant / Admin)
 */
export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-8 animate-fadeIn max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header Banner Skeleton */}
      <div className="bg-slate-800/80 rounded-3xl p-6 sm:p-8 border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-2 w-full md:w-1/2">
          <Skeleton className="w-36 h-4 rounded-full" />
          <Skeleton className="w-3/4 h-8" />
          <Skeleton className="w-1/2 h-4" />
        </div>
        <Skeleton className="w-36 h-11 rounded-2xl shrink-0" />
      </div>

      {/* Stats Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-slate-800/60 p-5 rounded-2xl border border-white/10 space-y-3">
            <div className="flex justify-between items-center">
              <Skeleton className="w-20 h-4" />
              <Skeleton className="w-9 h-9 rounded-xl" />
            </div>
            <Skeleton className="w-28 h-7" />
            <Skeleton className="w-16 h-3" />
          </div>
        ))}
      </div>

      {/* Main Content Table/List Skeleton */}
      <div className="bg-slate-800/60 rounded-3xl p-6 border border-white/10 space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-white/10">
          <Skeleton className="w-48 h-6" />
          <Skeleton className="w-24 h-8 rounded-xl" />
        </div>

        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 w-full">
                <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
                <div className="space-y-2 w-full max-w-sm">
                  <Skeleton className="w-3/4 h-4" />
                  <Skeleton className="w-1/2 h-3" />
                </div>
              </div>
              <Skeleton className="w-20 h-6 rounded-full shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/**
 * Skeleton loader for Profile and Account views
 */
export const ProfileSkeleton: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8 animate-fadeIn">
      {/* Profile Header Skeleton */}
      <div className="bg-slate-800/80 rounded-3xl p-6 sm:p-8 border border-white/10 flex flex-col sm:flex-row items-center gap-6 text-center sm:text-left">
        <Skeleton className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-slate-700 shrink-0" />
        <div className="space-y-2 flex-1 w-full">
          <Skeleton className="w-48 h-7 mx-auto sm:mx-0" />
          <Skeleton className="w-32 h-4 mx-auto sm:mx-0" />
          <Skeleton className="w-24 h-5 rounded-full mx-auto sm:mx-0 mt-2" />
        </div>
        <Skeleton className="w-32 h-10 rounded-2xl shrink-0" />
      </div>

      {/* Profile Form Fields Skeleton */}
      <div className="bg-slate-800/60 rounded-3xl p-6 sm:p-8 border border-white/10 space-y-6">
        <Skeleton className="w-40 h-6" />
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="w-24 h-4" />
              <Skeleton className="w-full h-11 rounded-xl" />
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Skeleton className="w-20 h-4" />
          <Skeleton className="w-full h-24 rounded-xl" />
        </div>

        <div className="flex justify-end pt-2">
          <Skeleton className="w-36 h-11 rounded-xl" />
        </div>
      </div>
    </div>
  );
};
