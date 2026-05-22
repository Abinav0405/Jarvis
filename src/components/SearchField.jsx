import { Search } from 'lucide-react';

const heights = { md: 'h-10', lg: 'h-12' };
const icons = { md: 'h-4 w-4', lg: 'h-[18px] w-[18px]' };

/**
 * Search field — icon sits in its own column (flex), never overlaps text.
 */
export function SearchField({
  value,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  placeholder = 'Search…',
  className = '',
  size = 'md',
  inputRef,
  type = 'search',
  autoComplete = 'off',
  spellCheck = false,
}) {
  return (
    <div
      className={`jarvis-search-field flex items-center gap-3 rounded-btn ${heights[size]} ${className}`}
    >
      <Search
        className={`ml-3.5 shrink-0 text-[rgba(240,240,240,0.38)] ${icons[size]}`}
        strokeWidth={2}
        aria-hidden
      />
      <input
        ref={inputRef}
        type={type}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete={autoComplete}
        spellCheck={spellCheck}
        className="min-w-0 flex-1 border-0 bg-transparent py-0 pr-4 font-sans text-sm text-[#F0F0F0] outline-none placeholder:text-[rgba(255,255,255,0.32)]"
      />
    </div>
  );
}
