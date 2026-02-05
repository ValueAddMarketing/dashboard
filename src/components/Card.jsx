/**
 * Reusable Card component
 */
export const Card = ({ children, className = '', onClick }) => {
  return (
    <div
      className={`card rounded-2xl p-6 ${onClick ? 'cursor-pointer hover:bg-dark-800/50' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
};

export default Card;
