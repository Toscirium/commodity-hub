import React from 'react';
import { useLocation } from 'react-router-dom';

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonical?: string;
  type?: 'website' | 'article' | 'product';
  image?: string;
  siteName?: string;
  author?: string;
  keywords?: string[];
  noIndex?: boolean;
  structuredData?: Record<string, unknown>;
}

const SEOHead: React.FC<SEOHeadProps> = ({
  title = "Commodity Hub - Professional Trading Analytics",
  description = "Live commodity prices, charts, and market insights across energy, metals, grains, softs, and livestock.",
  canonical,
  type = 'website',
  image = '/icon.png',
  siteName = 'Commodity Hub',
  author = 'Commodity Hub Team',
  keywords = ['commodity prices', 'live commodity data', 'oil price', 'gold price', 'market insights', 'price tracker'],
  noIndex = false,
  structuredData
}) => {
  const location = useLocation();
  const currentUrl = `${window.location.origin}${location.pathname}`;
  const canonicalUrl = canonical || currentUrl;
  const fullTitle = title.includes('Commodity Hub') ? title : `${title} | Commodity Hub`;

  React.useEffect(() => {
    // Update document title
    document.title = fullTitle;

    // Update meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', description);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = description;
      document.head.appendChild(meta);
    }

    // Update meta keywords
    let metaKeywords = document.querySelector('meta[name="keywords"]');
    if (!metaKeywords) {
      metaKeywords = document.createElement('meta');
      metaKeywords.setAttribute('name', 'keywords');
      document.head.appendChild(metaKeywords);
    }
    metaKeywords.setAttribute('content', keywords.join(', '));

    // Update canonical link
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (!canonicalLink) {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalLink);
    }
    canonicalLink.setAttribute('href', canonicalUrl);

    // Update Open Graph tags
    updateMetaTag('property', 'og:title', fullTitle);
    updateMetaTag('property', 'og:description', description);
    updateMetaTag('property', 'og:type', type);
    updateMetaTag('property', 'og:url', canonicalUrl);
    updateMetaTag('property', 'og:image', image);
    updateMetaTag('property', 'og:site_name', siteName);

    // Update Twitter Card tags
    updateMetaTag('name', 'twitter:card', 'summary_large_image');
    updateMetaTag('name', 'twitter:title', fullTitle);
    updateMetaTag('name', 'twitter:description', description);
    updateMetaTag('name', 'twitter:image', image);

    // Update author
    updateMetaTag('name', 'author', author);

    // Update robots meta tag
    const robotsContent = noIndex ? 'noindex, nofollow' : 'index, follow';
    updateMetaTag('name', 'robots', robotsContent);

    // Add structured data if provided
    if (structuredData) {
      let scriptTag = document.querySelector('script[type="application/ld+json"]') as HTMLScriptElement;
      if (!scriptTag) {
        scriptTag = document.createElement('script');
        scriptTag.type = 'application/ld+json';
        document.head.appendChild(scriptTag);
      }
      scriptTag.textContent = JSON.stringify(structuredData);
    }

    // Add viewport meta tag for mobile responsiveness
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover');
      document.head.appendChild(viewportMeta);
    }

    // Add theme color for mobile browsers
    updateMetaTag('name', 'theme-color', '#8B5CF6');
    updateMetaTag('name', 'msapplication-TileColor', '#8B5CF6');

  }, [fullTitle, description, canonicalUrl, type, image, siteName, author, keywords, noIndex, structuredData]);

  return null;
};

// Helper function to update or create meta tags
const updateMetaTag = (attribute: string, attributeValue: string, content: string) => {
  let meta = document.querySelector(`meta[${attribute}="${attributeValue}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute(attribute, attributeValue);
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
};

export default SEOHead;