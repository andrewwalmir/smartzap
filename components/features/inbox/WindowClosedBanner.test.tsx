import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WindowClosedBanner } from './WindowClosedBanner'

describe('WindowClosedBanner', () => {
  it('mostra texto de janela expirada e acao de template', () => {
    const onSelectTemplate = vi.fn()

    render(
      <WindowClosedBanner
        hasMessages
        elapsedLabel="Ultima mensagem ha 25h 0m"
        onSelectTemplate={onSelectTemplate}
      />,
    )

    expect(screen.getByText(/Janela de 24h expirou/i)).not.toBeNull()
    expect(screen.getByText(/Ultima mensagem ha 25h 0m/i)).not.toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Selecionar Template/i }))
    expect(onSelectTemplate).toHaveBeenCalledTimes(1)
  })

  it('adapta o texto para conversa sem mensagens', () => {
    render(<WindowClosedBanner hasMessages={false} />)
    expect(screen.getByText(/Envie um template para iniciar a conversa/i)).not.toBeNull()
  })
})
