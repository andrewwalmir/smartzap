import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildInboxMessage } from '@/tests/helpers'
import { MessageBubble } from './MessageBubble'

describe('MessageBubble', () => {
  it('renderiza badge de template e preview de imagem quando payload traz headerMediaPreviewUrl', () => {
    render(
      <MessageBubble
        message={buildInboxMessage({
          direction: 'outbound',
          message_type: 'template',
          content: '📋 *Template: boas_vindas*\n\n[🖼️ Imagem]\n\nOlá cliente',
          payload: {
            headerMediaPreviewUrl: 'https://example.com/header.jpg',
          },
        })}
      />,
    )

    expect(screen.getByText('Template')).not.toBeNull()
    expect(screen.getByAltText(/Preview do header do template/i).getAttribute('src')).toBe(
      'https://example.com/header.jpg',
    )
  })
})
