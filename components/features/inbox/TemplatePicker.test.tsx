import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { buildTemplate } from '@/tests/helpers'
import { TemplatePicker } from './TemplatePicker'

const mockGetAll = vi.fn()

vi.mock('@/services/templateService', () => ({
  templateService: {
    getAll: (...args: unknown[]) => mockGetAll(...args),
  },
}))

describe('TemplatePicker', () => {
  it('carrega apenas templates aprovados e permite busca/selecionar', async () => {
    mockGetAll.mockResolvedValueOnce([
      buildTemplate({ id: '1', name: 'boas_vindas', status: 'APPROVED' }),
      buildTemplate({ id: '2', name: 'rejeitado', status: 'REJECTED' }),
    ])

    render(
      <TemplatePicker
        open
        onOpenChange={vi.fn()}
        onSendTemplate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText('boas_vindas').length).toBeGreaterThan(0)
    })

    expect(screen.queryByText('rejeitado')).toBeNull()

    fireEvent.change(screen.getByPlaceholderText(/Buscar template/i), {
      target: { value: 'boas' },
    })

    expect(screen.getAllByText('boas_vindas').length).toBeGreaterThan(0)
  })

  it('mostra erro e botao de retry quando fetch falha', async () => {
    mockGetAll.mockRejectedValueOnce(new Error('Network error'))

    render(
      <TemplatePicker
        open
        onOpenChange={vi.fn()}
        onSendTemplate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Network error')).not.toBeNull()
    })

    expect(screen.getByText(/Tentar novamente/i)).not.toBeNull()
  })

  it('recarrega templates ao clicar em Tentar novamente', async () => {
    mockGetAll.mockRejectedValueOnce(new Error('Network error'))

    render(
      <TemplatePicker
        open
        onOpenChange={vi.fn()}
        onSendTemplate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText('Network error')).not.toBeNull()
    })

    mockGetAll.mockResolvedValueOnce([
      buildTemplate({ id: '1', name: 'boas_vindas', status: 'APPROVED' }),
    ])

    fireEvent.click(screen.getByText(/Tentar novamente/i))

    await waitFor(() => {
      expect(screen.getAllByText('boas_vindas').length).toBeGreaterThan(0)
    })

    expect(screen.queryByText('Network error')).toBeNull()
  })

  it('mostra mensagem quando nenhum template aprovado existe', async () => {
    mockGetAll.mockResolvedValueOnce([
      buildTemplate({ id: '1', name: 'draft', status: 'REJECTED' }),
    ])

    render(
      <TemplatePicker
        open
        onOpenChange={vi.fn()}
        onSendTemplate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await waitFor(() => {
      expect(screen.getByText(/Nenhum template aprovado encontrado/i)).not.toBeNull()
    })
  })

  it('mostra mensagem quando busca nao encontra resultado na lista', async () => {
    mockGetAll.mockResolvedValueOnce([
      buildTemplate({ id: '1', name: 'boas_vindas', status: 'APPROVED' }),
    ])

    render(
      <TemplatePicker
        open
        onOpenChange={vi.fn()}
        onSendTemplate={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    await waitFor(() => {
      expect(screen.getAllByText('boas_vindas').length).toBeGreaterThan(0)
    })

    fireEvent.change(screen.getByPlaceholderText(/Buscar template/i), {
      target: { value: 'inexistente' },
    })

    expect(screen.getByText(/Nenhum template aprovado encontrado/i)).not.toBeNull()
  })
})
