import { useEffect, useState } from 'react';

/** 节点首次进入浏览器可见区域后永久激活，离屏时不再卸载已加载内容。 */
export default function useViewportActivation(elementRef) {
  const [activated, setActivated] = useState(false);

  useEffect(() => {
    if (activated) return;
    const element = elementRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setActivated(true);
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setActivated(true);
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [activated, elementRef]);

  return activated;
}
