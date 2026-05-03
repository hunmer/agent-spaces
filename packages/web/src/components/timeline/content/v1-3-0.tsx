import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

const V1_3_0_Content = () => {
  return (
    <div>
      <div className='space-y-4'>
        <div className='space-y-3'>
          <h3 className='text-xl font-semibold'>Component Sync Unified Library Management (Beta)</h3>
          <p className='text-muted-foreground text-sm'>
            We&apos;re launching Component Sync, a new way to manage, version, and update all your shadcn components
            across projects with a single click.
          </p>
        </div>
        <div className='space-y-3'>
          <p className='font-medium'>Now you can :</p>
          <ul className='text-muted-foreground ml-2 list-inside list-disc space-y-3 text-sm'>
            <li>Sync shared components instantly between multiple apps</li>
            <li>Track version diffs and apply updates selectively</li>
            <li>Automatically resolve dependency conflicts</li>
          </ul>
        </div>
        <img
          src='https://cdn.shadcnstudio.com/ss-assets/blocks/marketing/timeline/image-04.png'
          alt='Component Sync Demo'
          className='rounded-[10px]'
        />
        <Accordion className='-mt-4 mb-0 w-full' defaultValue={['item-1']}>
          <AccordionItem value='item-1'>
            <AccordionTrigger className='hover:no-underline [&>svg]:size-6'>
              <Badge className='h-6 rounded-sm border-none bg-green-600/10 text-green-600 focus-visible:ring-green-600/20 focus-visible:outline-none dark:bg-green-400/10 dark:text-green-400 dark:focus-visible:ring-green-400/40 [a&]:hover:bg-green-600/5 dark:[a&]:hover:bg-green-400/5'>
                New
              </Badge>
            </AccordionTrigger>
            <AccordionContent className='text-muted-foreground'>
              <ul className='text-muted-foreground list-inside list-disc space-y-3 text-sm'>
                <li>“Sync All” button for project-wide updates.</li>
                <li>Component diff viewer with inline changelog.</li>
                <li>Scoped sync choose which namespaces or folders to update</li>
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
                <li>Faster load times in component explorer (-30%)</li>
                <li>Auto-preview for dark/light theme variants</li>
                <li>TypeScript types now update automatically when syncing</li>
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
                <li>Fixed sync conflicts with large component libraries</li>
                <li>Resolved memory leak in diff viewer</li>
                <li>Fixed incorrect version detection for nested components</li>
              </ul>
              <div className='mt-4 flex flex-wrap items-center gap-4'>
                <div className='bg-primary/10 text-destructive rounded-[6px] px-3 py-1 text-xs leading-4.5 font-medium'>
                  /v1/components/sync
                </div>
                <div className='bg-primary/10 text-destructive rounded-[6px] px-3 py-1 text-xs leading-4.5 font-medium'>
                  /v1/components/pull
                </div>
                <div className='bg-primary/10 text-destructive rounded-[6px] px-3 py-1 text-xs leading-4.5 font-medium'>
                  --interactive
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}

export default V1_3_0_Content
