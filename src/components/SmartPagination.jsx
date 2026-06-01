import React from 'react';

import './SmartPagination.css';

/* eslint-disable react-refresh/only-export-components */

export function buildPageList(currentPage, totalPages) {
  if (!Number.isFinite(totalPages) || totalPages < 1) return [];

  const pages = new Set();
  pages.add(1);
  pages.add(totalPages);

  for (let i = currentPage - 1; i <= currentPage + 1; i += 1) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const output = [];
  let prev = 0;

  sorted.forEach((page) => {
    if (prev && page - prev > 1) output.push('...');
    output.push(page);
    prev = page;
  });

  return output;
}

export function scrollToCardAnchor(el, anchor) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  if (anchor === 'bottom') {
    const bottom = rect.bottom + window.scrollY - window.innerHeight + 12;
    window.scrollTo({ top: Math.max(0, bottom), left: 0, behavior: 'smooth' });
  } else {
    const top = rect.top + window.scrollY - 12;
    window.scrollTo({ top, left: 0, behavior: 'smooth' });
  }
}

export default function SmartPagination({
  currentPage,
  totalPages,
  onPageChange,
  scrollTargetRef,
  className = '',
  showInfo = false,
  children,
}) {
  const pageList = buildPageList(currentPage, totalPages);
  const variant = className || '';
  const isDash = variant.includes('dash-pagination');
  const isInventory = variant.includes('inv-pagination-card');
  const isRefunds = variant.includes('refunds-pagination');
  const isYjacks = variant.includes('yjack-pagination');
  const isRepairs = variant.includes('rep-pagination-card');
  const isRepairReplacements = variant.includes('rr-pagination-card');

  const baseButtonClass = [
    'smart-page-btn',
    isDash ? 'dash-page-btn' : '',
    isInventory ? 'inv-page-btn' : '',
    isRefunds ? 'refunds-page-btn' : '',
    isYjacks ? 'yjack-btn small' : '',
    isRepairs ? 'rep-page-btn' : '',
    isRepairReplacements ? 'rr-page-btn' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const pageNumberWrapClass = [
    'smart-page-numbers',
    isRepairs ? 'rep-page-numbers' : '',
    isRepairReplacements ? 'rr-page-numbers' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const ellipsisClass = [
    'smart-page-ellipsis',
    isDash ? 'dash-page-ellipsis' : '',
    isRepairs ? 'rep-page-dots' : '',
    isRepairReplacements ? 'rr-page-dots' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const handlePageChange = (targetPage, anchor) => {
    if (targetPage < 1 || targetPage > totalPages || targetPage === currentPage) return;

    onPageChange(targetPage, anchor);

    if (!scrollTargetRef?.current) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToCardAnchor(scrollTargetRef.current, anchor);
      });
    });
  };

  return (
    <div className={`smart-pagination ${className}`.trim()}>
      <button
        className={baseButtonClass}
        type="button"
        onClick={() => handlePageChange(currentPage - 1, 'bottom')}
        disabled={currentPage === 1}
      >
        <i className="bi bi-chevron-left" /> Prev
      </button>

      <div className={pageNumberWrapClass}>
        {pageList.map((p, idx) =>
          p === '...' ? (
            <span key={`ellipsis-${idx}`} className={ellipsisClass}>
              ...
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`${baseButtonClass} smart-page-num ${isDash ? 'dash-page-num' : ''} ${
                isRepairs ? 'rep-page-num' : ''
              } ${isRepairReplacements ? 'rr-page-num' : ''} ${p === currentPage ? 'active' : ''}`.trim()}
              onClick={() => handlePageChange(p, 'top')}
              disabled={p === currentPage}
            >
              {p}
            </button>
          )
        )}
      </div>

      <button
        className={baseButtonClass}
        type="button"
        onClick={() => handlePageChange(currentPage + 1, 'top')}
        disabled={currentPage === totalPages}
      >
        Next <i className="bi bi-chevron-right" />
      </button>

      {showInfo && <div className="smart-page-info">Page {currentPage} of {totalPages}</div>}
      {children}
    </div>
  );
}
