/**
 * Reusable Button component
 */
const variants = {
  primary: 'bg-gradient-to-r from-brand-cyan to-brand-purple text-white font-semibold',
  secondary: 'bg-dark-800 hover:bg-dark-700 text-slate-300',
  success: 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30',
  danger: 'bg-red-500/20 text-red-400 hover:bg-red-500/30',
  ghost: 'text-slate-400 hover:text-white hover:bg-dark-800'
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2',
  lg: 'px-6 py-3'
};

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  className = '',
  onClick,
  type = 'button'
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        rounded-xl transition-all duration-200
        ${variants[variant]}
        ${sizes[size]}
        ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="animate-spin">⚙️</span>
          Loading...
        </span>
      ) : children}
    </button>
  );
};

export default Button;
