export function Stars({ rating }: { rating: number }) {
  return (
    <span className="stars" role="img" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}<span style={{ color: '#c9cacc' }}>{'★'.repeat(5 - rating)}</span>
    </span>
  );
}
