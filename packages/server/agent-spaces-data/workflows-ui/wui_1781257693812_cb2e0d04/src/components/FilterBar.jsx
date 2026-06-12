import { LANGUAGES } from '../utils/settings';

const { Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } = window.AgentSpacesUI;
const { Search } = window.AgentSpacesUI;

// 搜索 + 语言过滤。过滤条件实时驱动 db.all 查询。
export default function FilterBar({ filter, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="搜索标题或代码…"
          value={filter.q || ''}
          onChange={(e) => onChange({ ...filter, q: e.target.value })}
        />
      </div>
      <Select
        value={filter.language || 'all'}
        onValueChange={(v) => onChange({ ...filter, language: v })}
      >
        <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部语言</SelectItem>
          {LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
