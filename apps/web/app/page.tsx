import { HeroSection } from '@/components/HeroSection'
import { FeaturesSection } from '@/components/FeaturesSection'
import { DemoSection } from '@/components/DemoSection'
import { PricingSection } from '@/components/PricingSection'
import { FAQSection } from '@/components/FAQSection'
import { CTASection } from '@/components/CTASection'

export default function Home() {
  return (
    <>
      <HeroSection />
      <DemoSection />
      <FeaturesSection />
      <PricingSection />
      <FAQSection />
      <CTASection />
    </>
  )
}
