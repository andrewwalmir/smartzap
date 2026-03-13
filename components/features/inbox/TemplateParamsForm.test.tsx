import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildTemplate } from '@/tests/helpers'
import { TemplateParamsForm } from './TemplateParamsForm'

describe('TemplateParamsForm', () => {
  it('exibe campos de variavel e atualiza o preview ao digitar', () => {
    render(
      <TemplateParamsForm
        template={buildTemplate({
          content: 'Olá {{1}}',
          components: [{ type: 'BODY', text: 'Olá {{1}}' }],
        })}
        onSubmit={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(/Variavel \{\{1\}\}/i)
    fireEvent.change(input, { target: { value: 'Andre' } })

    expect(screen.getByText('Olá Andre')).not.toBeNull()
  })

  it('permite envio direto quando o template nao tem variaveis', () => {
    const onSubmit = vi.fn()

    render(
      <TemplateParamsForm
        template={buildTemplate({
          content: 'Mensagem sem parametros',
          components: [{ type: 'BODY', text: 'Mensagem sem parametros' }],
        })}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Enviar Template/i }))
    expect(onSubmit).toHaveBeenCalledWith({})
  })

  it('desabilita botao quando variaveis obrigatorias nao estao preenchidas', () => {
    render(
      <TemplateParamsForm
        template={buildTemplate({
          content: 'Olá {{1}}, seu pedido {{2}}',
          components: [{ type: 'BODY', text: 'Olá {{1}}, seu pedido {{2}}' }],
        })}
        onSubmit={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: /Enviar Template/i })
    expect(button.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText(/Variavel \{\{1\}\}/i), {
      target: { value: 'Andre' },
    })

    // Still disabled - {{2}} empty
    expect(button.hasAttribute('disabled')).toBe(true)

    fireEvent.change(screen.getByLabelText(/Variavel \{\{2\}\}/i), {
      target: { value: '#12345' },
    })

    // Now enabled
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('desabilita inputs e mostra spinner durante envio', () => {
    render(
      <TemplateParamsForm
        template={buildTemplate({
          content: 'Olá {{1}}',
          components: [{ type: 'BODY', text: 'Olá {{1}}' }],
        })}
        isSending
        onSubmit={vi.fn()}
      />,
    )

    const input = screen.getByLabelText(/Variavel \{\{1\}\}/i)
    expect(input.hasAttribute('disabled')).toBe(true)

    const button = screen.getByRole('button', { name: /Enviar Template/i })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('nao chama onSubmit quando variaveis estao vazias', () => {
    const onSubmit = vi.fn()

    render(
      <TemplateParamsForm
        template={buildTemplate({
          content: 'Olá {{1}}',
          components: [{ type: 'BODY', text: 'Olá {{1}}' }],
        })}
        onSubmit={onSubmit}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Enviar Template/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
