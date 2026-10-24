'use client';

import { useI18n } from '@/lib/i18n';
import { BUILD_GUIDE } from '@/lib/installation';

export function CandidateBuildLink({ className }: { className?: string }) {
  const { locale } = useI18n();
  return <a href={BUILD_GUIDE} target="_blank" rel="noopener noreferrer" className={className}>
    {locale === 'zh-CN' ? '源码构建（安装包尚未发布）' : 'Build from source (installer not yet released)'}
  </a>;
}
