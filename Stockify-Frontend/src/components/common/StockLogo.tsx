import React, { useState, useEffect, useMemo } from "react";
import { getStockLogoCandidates, setCachedLogo, removeCachedLogo } from "../../utils/stockLogo";
const defaultLogo = "https://mystockifyassets.blob.core.windows.net/assets/imageinv.png";

interface StockLogoProps {
  symbol: string;
  name?: string;
  domain?: string;
  className?: string;
  style?: React.CSSProperties;
  fallbackToAvatar?: boolean;
  avatarClassName?: string;
}

export const StockLogo: React.FC<StockLogoProps> = ({
  symbol,
  name,
  domain,
  className = "stock-search-logo",
  style,
  fallbackToAvatar = false,
  avatarClassName = "stock-symbol-avatar",
}) => {
  const candidates = useMemo(() => getStockLogoCandidates(symbol, domain), [symbol, domain]);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setCandidateIdx(0);
    setHasError(false);
  }, [symbol, domain, name]);

  const handleError = () => {
    // Invalidate cached logo if the current candidate failed to load
    const failedUrl = candidates[candidateIdx];
    if (failedUrl) {
      removeCachedLogo(symbol);
    }

    if (candidateIdx + 1 < candidates.length) {
      setCandidateIdx((prev) => prev + 1);
    } else {
      setHasError(true);
    }
  };

  const handleLoad = () => {
    if (candidates[candidateIdx]) {
      setCachedLogo(symbol, candidates[candidateIdx]);
    }
  };

  const currentSrc = candidates[candidateIdx];

  if (!hasError && currentSrc) {
    return (
      <img
        key={currentSrc}
        src={currentSrc}
        alt={symbol}
        className={className}
        style={style}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
        decoding="async"
      />
    );
  }

  if (fallbackToAvatar) {
    const initials = (symbol || "ST")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 3)
      .toUpperCase();
    return (
      <div className={avatarClassName} style={style}>
        {initials}
      </div>
    );
  }

  // Direct default image: imageinv.png
  return (
    <img
      src={defaultLogo}
      alt={symbol}
      className={className}
      style={style}
      loading="lazy"
      decoding="async"
    />
  );
};

export default StockLogo;
