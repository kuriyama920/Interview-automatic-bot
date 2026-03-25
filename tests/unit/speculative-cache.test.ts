import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SpeculativeCache } from '../../src/renderer/src/utils/speculative-cache'

describe('SpeculativeCache', () => {
  let cache: SpeculativeCache

  beforeEach(() => {
    cache = new SpeculativeCache()
  })

  describe('set / get（完全一致）', () => {
    it('setでエントリ追加、getで取得できる', () => {
      cache.set('自己紹介してください', '私はエンジニアです。')

      expect(cache.get('自己紹介してください')).toBe('私はエンジニアです。')
    })

    it('存在しないキーはnullを返す', () => {
      expect(cache.get('存在しないキー')).toBeNull()
    })

    it('同じキーで上書きすると最新の値を返す', () => {
      cache.set('質問', '回答1')
      cache.set('質問', '回答2')

      expect(cache.get('質問')).toBe('回答2')
    })

    it('sizeが正しく反映される', () => {
      expect(cache.size).toBe(0)

      cache.set('key1', 'value1')
      expect(cache.size).toBe(1)

      cache.set('key2', 'value2')
      expect(cache.size).toBe(2)

      // 同じキーで上書きはサイズ増えない
      cache.set('key1', 'updated')
      expect(cache.size).toBe(2)
    })
  })

  describe('TTL（有効期限）', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('TTL 5分以内はキャッシュヒット', () => {
      cache.set('質問', '回答')

      // 4分59秒経過
      vi.advanceTimersByTime(4 * 60 * 1000 + 59 * 1000)

      expect(cache.get('質問')).toBe('回答')
    })

    it('TTL 5分超過でキャッシュミス（nullを返す）', () => {
      cache.set('質問', '回答')

      // 5分1秒経過
      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      expect(cache.get('質問')).toBeNull()
    })

    it('TTL超過エントリはgetで自動削除される', () => {
      cache.set('質問', '回答')
      expect(cache.size).toBe(1)

      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      cache.get('質問') // TTL切れなのでnull + 削除
      expect(cache.size).toBe(0)
    })

    it('カスタムTTLを指定できる', () => {
      const shortTtlCache = new SpeculativeCache(50, 10 * 1000) // 10秒TTL

      shortTtlCache.set('key', 'value')

      vi.advanceTimersByTime(9 * 1000)
      expect(shortTtlCache.get('key')).toBe('value')

      vi.advanceTimersByTime(2 * 1000) // 合計11秒
      expect(shortTtlCache.get('key')).toBeNull()
    })
  })

  describe('LRU eviction（最大サイズ）', () => {
    it('最大50エントリでLRU eviction（最古エントリ削除）', () => {
      const smallCache = new SpeculativeCache(3)

      smallCache.set('key1', 'value1')
      smallCache.set('key2', 'value2')
      smallCache.set('key3', 'value3')
      expect(smallCache.size).toBe(3)

      // 4つ目追加 → 最古のkey1が削除される
      smallCache.set('key4', 'value4')
      expect(smallCache.size).toBe(3)
      expect(smallCache.get('key1')).toBeNull() // evicted
      expect(smallCache.get('key2')).toBe('value2')
      expect(smallCache.get('key3')).toBe('value3')
      expect(smallCache.get('key4')).toBe('value4')
    })

    it('デフォルトの最大サイズは50', () => {
      const defaultCache = new SpeculativeCache()

      for (let i = 0; i < 50; i++) {
        defaultCache.set(`key${i}`, `value${i}`)
      }
      expect(defaultCache.size).toBe(50)

      // 51個目で最古が削除
      defaultCache.set('key50', 'value50')
      expect(defaultCache.size).toBe(50)
      expect(defaultCache.get('key0')).toBeNull()
      expect(defaultCache.get('key50')).toBe('value50')
    })
  })

  describe('findSimilar（類似キー検索）', () => {
    it('bigramSimilarity >= 0.8 でキャッシュヒット', () => {
      cache.set('自己紹介をしてください', 'エンジニアとして5年の経験があります。')

      // 非常に類似したクエリ（助詞の違い程度）
      const result = cache.findSimilar('自己紹介してください')

      expect(result).not.toBeNull()
      expect(result).toBe('エンジニアとして5年の経験があります。')
    })

    it('bigramSimilarity < 0.8 でキャッシュミス', () => {
      cache.set('自己紹介をしてください', 'エンジニアとして5年の経験があります。')

      // 全く異なるクエリ
      const result = cache.findSimilar('今後のキャリアプランは？')

      expect(result).toBeNull()
    })

    it('カスタム閾値を指定できる', () => {
      cache.set('あなたの強みは何ですか', '問題解決能力です。')

      // 低い閾値であればヒット
      const resultLow = cache.findSimilar('あなたの強みを教えて', 0.3)
      expect(resultLow).not.toBeNull()

      // 高い閾値ではミス
      const resultHigh = cache.findSimilar('あなたの強みを教えて', 0.99)
      expect(resultHigh).toBeNull()
    })

    it('複数エントリから最も類似度の高いものを返す', () => {
      cache.set('自己紹介をしてください', '回答A')
      cache.set('志望動機を教えてください', '回答B')
      cache.set('自己紹介をお願いします', '回答C')

      // 「自己紹介してください」は「自己紹介をお願いします」より「自己紹介をしてください」に近い
      const result = cache.findSimilar('自己紹介をしてください')
      // 完全一致なのでexact matchがgetで返る前にfindSimilarで返る
      expect(result).toBe('回答A')
    })

    it('空のキャッシュではnullを返す', () => {
      expect(cache.findSimilar('何か')).toBeNull()
    })

    it('TTL超過エントリは類似検索でもスキップされる', () => {
      vi.useFakeTimers()

      cache.set('自己紹介をしてください', 'エンジニアです。')

      vi.advanceTimersByTime(5 * 60 * 1000 + 1000)

      expect(cache.findSimilar('自己紹介してください')).toBeNull()

      vi.useRealTimers()
    })
  })

  describe('clear', () => {
    it('全エントリをクリアする', () => {
      cache.set('key1', 'value1')
      cache.set('key2', 'value2')
      cache.set('key3', 'value3')
      expect(cache.size).toBe(3)

      cache.clear()
      expect(cache.size).toBe(0)
      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBeNull()
      expect(cache.get('key3')).toBeNull()
    })
  })
})

describe('bigramSimilarity（内部関数のエッジケース）', () => {
  // SpeculativeCacheのfindSimilarを通して間接的にテスト
  let cache: SpeculativeCache

  beforeEach(() => {
    cache = new SpeculativeCache()
  })

  it('同一文字列は類似度1.0（完全一致）', () => {
    cache.set('テスト文字列', '結果')

    // 完全一致はfindSimilarでもヒットするはず
    expect(cache.findSimilar('テスト文字列', 0.99)).toBe('結果')
  })

  it('空文字列のキーでもエラーにならない', () => {
    cache.set('', 'empty')
    expect(cache.get('')).toBe('empty')
    expect(cache.findSimilar('')).toBeNull() // 空文字のbigram類似度は0
  })

  it('1文字のキーでもエラーにならない', () => {
    cache.set('あ', '結果')
    expect(cache.get('あ')).toBe('結果')
    // 1文字はbigramが生成されないので類似検索はミス
    expect(cache.findSimilar('い')).toBeNull()
  })
})
