import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const V1_1_0_Content = () => {
  return (
    <div>
      <div className='space-y-4'>
        <div className='space-y-3'>
          <h3 className='text-xl font-semibold'>Design Tokens 2.0 Global Theme Rebuild</h3>
          <p className='text-muted-foreground text-sm'>
            We&apos;ve completely redesigned the theme system for Design Tokens 2.0. Tokens are now hierarchical,
            semantic, and fully type-safe — built for scaling design systems.
          </p>
        </div>
        <img
          src='https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/timeline/image-03.png'
          alt='Component Sync Demo'
          className='rounded-[10px] border'
        />
        <p className='text-muted-foreground text-sm'>
          Design Tokens 2.0 introduces a complete overhaul of how themes are managed within shadcnstudio. With this
          update, design tokens are now hierarchical and semantic, offering greater flexibility and scalability for your
          design system.
        </p>
        <p className='text-muted-foreground text-sm'>
          The new system supports automatic dark/light theme pairing, making it easier than ever to maintain consistent
          visuals across all environments. Tokens for colors, spacing, typography, and more are now fully type-safe and
          easily customizable, ensuring that your design system can grow alongside your projects.{' '}
        </p>
        <Accordion className='-mt-4 mb-0 w-full' defaultValue={['item-1']}>
          <AccordionItem value='item-1'>
            <AccordionTrigger className='hover:no-underline [&>svg]:size-6'>
              <Badge className='h-6 rounded-sm border-none bg-green-600/10 text-green-600 focus-visible:ring-green-600/20 focus-visible:outline-none dark:bg-green-400/10 dark:text-green-400 dark:focus-visible:ring-green-400/40 [a&]:hover:bg-green-600/5 dark:[a&]:hover:bg-green-400/5'>
                New
              </Badge>
            </AccordionTrigger>
            <AccordionContent className='text-muted-foreground'>
              <ul className='text-muted-foreground list-inside list-disc space-y-3 text-sm'>
                <li>Complete token overhaul unified color, spacing & typography system.</li>
                <li>Preset Themes instantly apply predefined light/dark palettes.</li>
                <li>Global token inspector view & edit all tokens in one place.</li>
                <li>Preview share links generate temporary links to share progress with your team</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='item-2'>
            <AccordionTrigger className='hover:no-underline [&>svg]:size-6'>
              <Badge className='h-6 rounded-sm border-none bg-sky-600/10 text-sky-600 focus-visible:ring-sky-600/20 focus-visible:outline-none dark:bg-sky-400/10 dark:text-sky-400 dark:focus-visible:ring-sky-400/40 [a&]:hover:bg-sky-600/5 dark:[a&]:hover:bg-sky-400/5'>
                Updates
              </Badge>
            </AccordionTrigger>
            <AccordionContent className='text-muted-foreground'>
              <ul className='text-muted-foreground list-inside list-disc space-y-3 text-sm'>
                <li>Smarter token fallback logic for consistent theming across components</li>
                <li>Improved OKLCH color handling for better contrast & accessibility</li>
                <li>Faster token rendering in the design preview (25% boost)</li>
                <li>Better error handling during build failures with clearer actions</li>
                <li>Updated environment variable manager for easier key/value edits</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value='item-3'>
            <AccordionTrigger className='hover:no-underline [&>svg]:size-6'>
              <Badge className='h-6 rounded-sm border-none bg-amber-600/10 text-amber-600 focus-visible:ring-amber-600/20 focus-visible:outline-none dark:bg-orange-400/10 dark:text-orange-400 dark:focus-visible:ring-orange-400/40 [a&]:hover:bg-amber-600/5 dark:[a&]:hover:bg-orange-400/5'>
                Bug Fixes
              </Badge>
            </AccordionTrigger>
            <AccordionContent className='text-muted-foreground'>
              <ul className='text-muted-foreground list-inside list-disc space-y-3 text-sm'>
                <li>Fixed broken references causing inconsistent button colors</li>
                <li>Corrected spacing token mismatch in forms and modals</li>
                <li>Resolved theme switching lag in large projects</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}

export default V1_1_0_Content
