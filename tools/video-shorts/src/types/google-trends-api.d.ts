declare module 'google-trends-api' {
  interface DailyTrendsOptions {
    geo: string
    hl?: string
    timezone?: number
    trendDate?: Date
  }

  interface RealTimeTrendsOptions {
    geo: string
    hl?: string
    timezone?: number
    category?: string
  }

  function dailyTrends(options: DailyTrendsOptions): Promise<string>
  function realTimeTrends(options: RealTimeTrendsOptions): Promise<string>

  export { dailyTrends, realTimeTrends }
}
