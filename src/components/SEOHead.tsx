import React from 'react';
import { Helmet } from 'react-helmet-async';

export interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string;
  canonicalUrl?: string;
  ogType?: string;
  ogImage?: string;
  noindex?: boolean;
  priceGhs?: number;
  jsonLd?: Record<string, any> | Array<Record<string, any>>;
}

export const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  keywords = "Goodlucks Homes, rentals Accra, Ghana real estate, apartments for rent, houses for rent East Legon, Cantonments, Airport Residential",
  canonicalUrl,
  ogType = "website",
  ogImage,
  noindex = false,
  priceGhs,
  jsonLd
}) => {
  const currentUrl = canonicalUrl || (typeof window !== 'undefined' ? window.location.href : 'https://rent.goodlucks.co');
  const defaultImage = ogImage || 'https://rent.goodlucks.co/og-image.jpg';

  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      
      {/* Robots Directive */}
      {noindex ? (
        <meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex" />
      ) : (
        <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
      )}

      {/* Canonical Link */}
      <link rel="canonical" href={currentUrl} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={defaultImage} />
      <meta property="og:site_name" content="Goodlucks Homes" />
      {priceGhs && <meta property="og:price:amount" content={priceGhs.toString()} />}
      {priceGhs && <meta property="og:price:currency" content="GHS" />}

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={currentUrl} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={defaultImage} />

      {/* Schema.org JSON-LD Structured Data */}
      {jsonLd && (
        <script type="application/ld+json">
          {JSON.stringify(jsonLd)}
        </script>
      )}
    </Helmet>
  );
};
