import { supabase } from '../supabase'

export const dashboardDb = {
    getStats: async () => {
        // Get campaign stats with aggregation
        const { data, error } = await supabase
            .from('campaigns')
            .select('sent, delivered, read, failed, status, name, total_recipients')

        if (error) throw error

        let totalSent = 0
        let totalDelivered = 0
        let totalFailed = 0
        let activeCampaigns = 0

            ; (data || []).forEach((row: any) => {
                totalSent += row.sent || 0
                totalDelivered += row.delivered || 0
                totalFailed += row.failed || 0
                if (row.status === 'Enviando' || row.status === 'Agendada') {
                    activeCampaigns++
                }
            })

        const deliveryRate = totalSent > 0
            ? ((totalDelivered / totalSent) * 100).toFixed(1)
            : '100'

        // Get recent campaigns for chart
        const chartData = (data || [])
            .slice(0, 7)
            .map((r: any) => ({
                name: (r.name as string).substring(0, 3),
                sent: r.total_recipients as number,
                read: r.read as number,
            }))
            .reverse()

        return {
            sent24h: totalSent.toLocaleString(),
            deliveryRate: `${deliveryRate}%`,
            activeCampaigns: activeCampaigns.toString(),
            failedMessages: totalFailed.toString(),
            chartData,
        }
    },
}
