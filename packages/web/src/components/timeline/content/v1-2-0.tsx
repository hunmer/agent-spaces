import { Badge } from '@/components/ui/badge'
import { CopyCode } from '@/components/ui/copy-code'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const V1_2_0_Content = () => {
  const codeExample = `// Example of updated API usage
const agent = new AIAgent({
  model: "Shadcn/studio",
  reasoning: "enhanced",
  multiModal: true,
});`

  return (
    <div>
      <div className='space-y-4'>
        <div className='space-y-3'>
          <h3 className='text-xl font-semibold'>Studio Dashboard Live Preview & Deployment</h3>
          <p className='text-muted-foreground text-sm'>
            The new Studio Dashboard brings together everything you need to preview, test, and deploy your component
            library right from your browser.
          </p>
        </div>
        <ul className='text-muted-foreground ml-2 list-inside list-disc space-y-3 text-sm'>
          <li>Preview components in any framework (Next.js, Remix, Vite)</li>
          <li>One-click deploy to Vercel</li>
          <li>Real-time preview links for teams</li>
        </ul>
        <div className='flex flex-wrap items-center gap-4'>
          {/* vite */}
          <div className='flex items-center gap-1.5 rounded-[6px] bg-amber-600/10 px-3 py-1 dark:bg-amber-400/10'>
            <img src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/vite-logo.png' alt='Vite' className='h-4.5' />
            <span className='text-xs font-medium'>Vite</span>
          </div>
          {/* React */}
          <div className='flex items-center gap-1.5 rounded-[6px] bg-sky-600/10 px-3 py-1 dark:bg-sky-400/10'>
            <img src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/react-logo.png' alt='React' className='h-4.5' />
            <span className='text-xs font-medium'>React</span>
          </div>
          {/* Angular */}
          <div className='bg-destructive/10 flex items-center gap-1.5 rounded-[6px] px-3 py-1'>
            <img
              src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/astro-icon.png'
              alt='Astro'
              className='h-4.5 dark:hidden'
            />
            <img
              src='https://cdn.shadcnstudio.com/ss-assets/brand-logo/astro-icon-dark.png'
              alt='Astro'
              className='hidden h-4.5 dark:block'
            />
            <span className='text-xs font-medium'>Astro</span>
          </div>
        </div>
        <CopyCode code={codeExample} />
        <p className='text-muted-foreground text-sm'>
          The Studio Dashboard is a powerful tool within shadcnstudio that streamlines the process of designing,
          previewing, and deploying your component library. It allows you to instantly preview components in different
          frameworks (like Next.js, Remix, and Vite) directly from the dashboard.
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
                <li>Live Preview mode instantly test UI changes inside the dashboard.</li>
                <li>One-click Deployment push updates to production without leaving Studio.</li>
                <li>Multi-environment support manage dev, staging, and production easily.</li>
                <li>New semantic tokens cleaner mapping for UI states (hover, active, focus)</li>
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
                <li>Improved preview performance for heavy UI blocks (+40% faster).</li>
                <li>Smarter auto-refresh reloads only the updated section, not the full screen.</li>
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
                <li>Fixed deployment logs not showing real-time events</li>
                <li>Corrected spacing token mismatch in forms, modals, and bento blocks</li>
                <li>Fixed incorrect color export in some frameworks (React / Vue)</li>
                <li>Resolved UI flicker when switching between preview modes</li>
                <li>Corrected environment variables not syncing in some workspaces</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}

export default V1_2_0_Content
