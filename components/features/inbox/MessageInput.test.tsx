import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MessageInput } from './MessageInput'

describe('MessageInput', () => {
  const baseProps = {
    onSend: vi.fn(),
    isSending: false,
    quickReplies: [],
  }

  it('renderiza CTA principal de template quando templateMode=true', () => {
    const onOpenTemplatePicker = vi.fn()

    render(
      <MessageInput
        {...baseProps}
        templateMode
        onOpenTemplatePicker={onOpenTemplatePicker}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Selecionar Template/i }))
    expect(onOpenTemplatePicker).toHaveBeenCalledTimes(1)
  })

  it('renderiza botao discreto de template no modo normal', () => {
    render(
      <MessageInput
        {...baseProps}
        onOpenTemplatePicker={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /Enviar template/i })).not.toBeNull()
  })
})
