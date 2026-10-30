/** @vitest-environment happy-dom */

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatText } from './ChatText';

afterEach(cleanup);

describe('ChatText', () => {
  it('shows **bold** as bold without the asterisks', () => {
    const { container } = render(<ChatText text="I prepared **Poori Sagu** as a curry." />);
    expect(container.querySelector('strong')).toHaveTextContent('Poori Sagu');
    expect(container).toHaveTextContent('I prepared Poori Sagu as a curry.');
  });

  it('turns "- " and "* " lines into bullets and drops heading marks', () => {
    const { container } = render(<ChatText text={'## Plan\n- Dosa\n* Idli'} />);
    expect(container.textContent).toBe('Plan\n• Dosa\n• Idli');
  });

  it('renders code spans', () => {
    const { container } = render(<ChatText text="Use `exclude`." />);
    expect(container.querySelector('code')).toHaveTextContent('exclude');
  });

  it('never turns links, images or HTML into elements', () => {
    const { container } = render(<ChatText text={'[x](https://evil.test) ![i](https://evil.test/a.png) <img src=x onerror=alert(1)> <b>hi</b>'} />);
    expect(container.querySelector('a, img, b')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('leaves an unfinished marker alone while the reply streams', () => {
    const { container } = render(<ChatText text="I prepared **Poori" />);
    expect(container.textContent).toBe('I prepared **Poori');
  });
});
