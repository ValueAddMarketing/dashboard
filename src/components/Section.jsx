/**
 * Section component with title
 */
export const Section = ({ title, icon, children, className = '' }) => {
  return (
    <div className={`card p-6 ${className}`}>
      {title && (
        <h3 className="section-title mb-4 flex items-center gap-2">
          {icon && <span>{icon}</span>}
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

export default Section;
