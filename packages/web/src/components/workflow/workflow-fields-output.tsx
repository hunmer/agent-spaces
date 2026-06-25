'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import {
	DndContext,
	closestCenter,
	PointerSensor,
	useSensor,
	useSensors,
	type DragEndEvent,
} from '@dnd-kit/core';
import {
	SortableContext,
	arrayMove,
	useSortable,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { OutputField } from '@agent-spaces/shared';
import { TagInput } from '@/components/common/tag-input';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Braces, ChevronRight, GripVertical, ListChecks, Plus, Trash2 } from 'lucide-react';
import {
	Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { JsonViewer, type JsonValue } from '@/components/viewers/json-viewer';
import { cn } from '@/lib/utils';
import { useTranslations } from 'next-intl';
import {
	FIELD_TYPES,
	getOutputFields,
	isFileOutputFieldType,
	isStructuredOutputFieldType,
	parseArrayOutputFieldValue,
	stringifyOutputFieldValue,
} from './workflow-properties-utils';
import type { WorkflowVariableContext } from './workflow-variable-picker';
import { WorkflowVariableInput } from './workflow-variable-input';
import { ImeSafeInput } from './workflow-fields-debounced';

let outputFieldDragIdCounter = 0;

function patchOutputField(field: OutputField, patch: Partial<OutputField>) {
	return { ...field, ...patch };
}

function getSelectOptions(options: OutputField['options']) {
	return Array.isArray(options) ? options : [];
}

function hasConfiguredVariable(field: OutputField) {
	return field.inputMode !== 'native' && stringifyOutputFieldValue(field.value).trim().length > 0;
}

function isDefaultExpandedField(field: OutputField) {
	return hasConfiguredVariable(field);
}

function createOutputField(type: OutputField['type']): OutputField {
	return isStructuredOutputFieldType(type)
		? { key: '', type, children: [] }
		: { key: '', type, value: '' };
}

function SortableOutputField({
	id,
	children,
}: {
	id: string;
	children: (sortable: ReturnType<typeof useSortable>) => ReactNode;
}) {
	const sortable = useSortable({ id });
	const { setNodeRef, transform, transition, isDragging } = sortable;
	const style: CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
	};

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn('space-y-0.5', isDragging && 'relative z-10 opacity-70')}
		>
			{children(sortable)}
		</div>
	);
}

export function JsonPreview({ value }: { value: unknown }) {
	return (
		<JsonViewer
			data={value as JsonValue}
			rootName="output"
			defaultExpanded={2}
		/>
	);
}

export function OutputFieldsEditor({
	value,
	onChange,
	variableContext,
	allowedFieldTypes,
	depth = 0,
	showRequired = false,
	outputPreviewEnabled: _outputPreviewEnabled,
	onOutputPreviewEnabledChange: _onOutputPreviewEnabledChange,
}: {
	value: OutputField[];
	onChange: (v: OutputField[]) => void;
	variableContext?: WorkflowVariableContext;
	allowedFieldTypes?: OutputField['type'][];
	depth?: number;
	showRequired?: boolean;
	outputPreviewEnabled?: boolean;
	onOutputPreviewEnabledChange?: (enabled: boolean) => void;
}) {
	const t = useTranslations('workflows.outputFields');
	const fields = getOutputFields(value);
	const [expandedFields, setExpandedFields] = useState<Set<number>>(() => new Set());
	const [collapsedFields, setCollapsedFields] = useState<Set<number>>(() => new Set());
	const [expandedDetailFields, setExpandedDetailFields] = useState<Set<number>>(() => new Set());
	const [collapsedDetailFields, setCollapsedDetailFields] = useState<Set<number>>(() => new Set());
	const [editorId] = useState(() => `output-fields-${outputFieldDragIdCounter++}`);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
	const indent = depth * 16;
	const fieldIds = fields.map((_, index) => `${editorId}-${index}`);
	const selectableFieldTypes = allowedFieldTypes?.length ? allowedFieldTypes : FIELD_TYPES;
	const defaultFieldType = selectableFieldTypes[0] ?? 'string';

	const updateField = (index: number, patch: Partial<OutputField>) => {
		const next = [...fields];
		next[index] = patchOutputField(next[index], patch);
		if (patch.type && !isStructuredOutputFieldType(patch.type)) {
			next[index].children = undefined;
		}
		if (patch.type && !isFileOutputFieldType(patch.type)) {
			next[index].fileNameFilter = undefined;
		}
		if (patch.type && patch.type !== 'select') {
			next[index].options = undefined;
		}
		if (patch.type && isStructuredOutputFieldType(patch.type) && !next[index].children) {
			next[index].children = [];
			next[index].value = undefined;
		}
		if (patch.type === 'select' && !next[index].options) {
			next[index].options = [];
		}
		onChange(next);
	};

	const isFieldExpanded = (field: OutputField, index: number) => (
		(isDefaultExpandedField(field) && !collapsedFields.has(index)) || expandedFields.has(index)
	);

	const isDetailFieldExpanded = (field: OutputField, index: number) => (
		(isDefaultExpandedField(field) && !collapsedDetailFields.has(index)) || expandedDetailFields.has(index)
	);

	const toggleExpand = (index: number) => {
		const defaultExpanded = isDefaultExpandedField(fields[index]);
		const expanded = isFieldExpanded(fields[index], index);
		setCollapsedFields((current) => {
			const next = new Set(current);
			if (expanded && defaultExpanded) next.add(index);
			else next.delete(index);
			return next;
		});
		setExpandedFields((current) => {
			const next = new Set(current);
			if (expanded) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	const toggleDetailExpand = (index: number) => {
		const defaultExpanded = isDefaultExpandedField(fields[index]);
		const expanded = isDetailFieldExpanded(fields[index], index);
		setCollapsedDetailFields((current) => {
			const next = new Set(current);
			if (expanded && defaultExpanded) next.add(index);
			else next.delete(index);
			return next;
		});
		setExpandedDetailFields((current) => {
			const next = new Set(current);
			if (expanded) next.delete(index);
			else next.add(index);
			return next;
		});
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		const oldIndex = fieldIds.indexOf(String(active.id));
		const newIndex = fieldIds.indexOf(String(over.id));
		if (oldIndex === -1 || newIndex === -1) return;
		onChange(arrayMove(fields, oldIndex, newIndex));
	};

	const insertVariable = (index: number, variablePath: string) => {
		updateField(index, { value: variablePath });
	};

	const toggleInputMode = (index: number) => {
		updateField(index, {
			inputMode: fields[index]?.inputMode === 'native' ? 'variable' : 'native',
		});
	};

	const renderFieldDetails = (field: OutputField, index: number) => (
		<div className="space-y-0.5" style={{ paddingLeft: `${indent + 20}px` }}>
			{isFileOutputFieldType(field.type) ? (
				<Input
					value={field.fileNameFilter ?? ''}
					onChange={(e) => updateField(index, { fileNameFilter: e.target.value || undefined })}
					placeholder={t('fileNameFilterPlaceholder')}
					className="h-6 text-[11px]"
				/>
			) : (
				<div className="flex items-start gap-1">
					<button
						type="button"
						className={`mt-0.5 rounded p-0.5 transition-colors hover:bg-accent ${field.inputMode === 'native' ? 'text-primary' : 'text-muted-foreground'}`}
						title={field.inputMode === 'native' ? t('switchToVariableInput') : t('switchToNativeInput')}
						onClick={() => toggleInputMode(index)}
					>
						{field.inputMode === 'native' ? <ListChecks className="h-3.5 w-3.5" /> : <Braces className="h-3.5 w-3.5" />}
					</button>
					<div className="min-w-0 flex-1">
						{field.inputMode === 'native' && field.type === 'select' ? (
							<TagInput
								value={getSelectOptions(field.options)}
								onChange={(options) => updateField(index, { options })}
								placeholder={t('selectOptionsPlaceholder')}
								addLabel={t('addOption')}
								className="h-6 text-[11px]"
							/>
						) : field.inputMode === 'native' ? (
							<Input
								value={stringifyOutputFieldValue(field.value)}
								onChange={(e) => updateField(index, { value: parseArrayOutputFieldValue(field.type, e.target.value) })}
								placeholder={t('defaultValuePlaceholder')}
								className="h-6 text-[11px]"
							/>
						) : (
							<WorkflowVariableInput
								value={stringifyOutputFieldValue(field.value)}
								placeholder={t('defaultValuePlaceholder')}
								variableContext={variableContext}
								typeFilter={field.type}
								groupClassName="min-h-6 h-auto rounded-md"
								inputClassName="text-[11px]"
								onChange={(nextValue) => updateField(index, { value: parseArrayOutputFieldValue(field.type, nextValue) })}
								onSelectVariable={(path) => insertVariable(index, path)}
							/>
						)}
					</div>
				</div>
			)}
			<Input
				value={field.description ?? ''}
				onChange={(e) => updateField(index, { description: e.target.value || undefined })}
				placeholder={t('descriptionPlaceholder')}
				className="h-6 text-[11px]"
			/>
		</div>
	);

	return (
		<div className="space-y-1">
			{depth === 0 && (
				<div className="grid shrink-0 grid-cols-[1fr_80px] gap-1 text-[10px] font-medium text-muted-foreground">
					<span>{t('name')}</span>
					<span>{t('type')}</span>
				</div>
			)}
			{depth === 0 && <Separator />}
			<div className="space-y-1">
				<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
					<SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
						{fields.map((field, index) => {
							const fieldExpanded = isFieldExpanded(field, index);
							const detailFieldExpanded = isDetailFieldExpanded(field, index);

							return (
								<SortableOutputField key={fieldIds[index]} id={fieldIds[index]}>
									{({ attributes, listeners }) => (
										<>
											<div
												className="group/field flex items-center gap-1"
												style={{ paddingLeft: `${indent}px` }}
											>
												<button
													type="button"
													{...attributes}
													{...listeners}
													className="flex h-5 w-3 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-muted-foreground/60 hover:bg-accent hover:text-foreground active:cursor-grabbing"
													aria-label={t('dragSortField')}
													title={t('dragSort')}
												>
													<GripVertical className="h-3 w-3" />
												</button>
												{isStructuredOutputFieldType(field.type) ? (
													<Button
														variant="ghost"
														size="icon"
														className={`h-5 w-5 shrink-0 text-muted-foreground ${detailFieldExpanded ? 'text-foreground' : ''}`}
														title={detailFieldExpanded ? t('addField') : t('defaultValuePlaceholder')}
														onClick={() => toggleDetailExpand(index)}
													>
														{detailFieldExpanded ? <ListChecks className="h-3 w-3" /> : <Braces className="h-3 w-3" />}
													</Button>
												) : (
													<Button
														variant="ghost"
														size="icon"
														className={`h-5 w-5 shrink-0 ${fieldExpanded ? '' : '-rotate-90'}`}
														onClick={() => toggleExpand(index)}
													>
														<ChevronRight className="h-3 w-3" />
													</Button>
												)}
												{showRequired && (
													<Checkbox
														checked={Boolean(field.required) || false}
														onCheckedChange={(checked) => updateField(index, { required: checked === true || undefined })}
														className="h-3.5 w-3.5"
														title={t('required')}
													/>
												)}
												<ImeSafeInput
													value={field.key ?? ''}
													onChange={(key) => updateField(index, { key })}
													placeholder={t('fieldNamePlaceholder')}
													className="h-6 min-w-0 flex-1 text-[11px]"
												/>
												<Select
													value={field.type ?? 'string'}
													onValueChange={(type) => updateField(index, { type: type as OutputField['type'] })}
												>
													<SelectTrigger size="sm" className="h-6 w-20 shrink-0 px-2 py-0 text-[11px] [&_svg]:size-3">
														<SelectValue />
													</SelectTrigger>
													<SelectContent>
														{selectableFieldTypes.map(type => (
															<SelectItem key={type} value={type} className="text-[11px]">{type}</SelectItem>
														))}
													</SelectContent>
												</Select>
												<Button
													variant="ghost"
													size="icon"
													className="h-5 w-5 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover/field:opacity-100"
													onClick={() => onChange(fields.filter((_, i) => i !== index))}
												>
													<Trash2 className="h-2.5 w-2.5" />
												</Button>
											</div>
											{((fieldExpanded && !isStructuredOutputFieldType(field.type))
												|| (detailFieldExpanded && isStructuredOutputFieldType(field.type))) && renderFieldDetails(field, index)}
											{!detailFieldExpanded && isStructuredOutputFieldType(field.type) && depth < 3 && (
												<div>
													<OutputFieldsEditor
														value={getOutputFields(field.children)}
														onChange={(children) => updateField(index, { children })}
														variableContext={variableContext}
														depth={depth + 1}
													/>
												</div>
											)}
										</>
									)}
								</SortableOutputField>
							);
						})}
					</SortableContext>
				</DndContext>
			</div>
			<div className="shrink-0 border-border/60 pt-1">
				<Button
					variant="ghost"
					size="sm"
					className="h-5 w-full gap-0.5 text-[10px] text-muted-foreground hover:text-foreground"
					style={{ paddingLeft: `${indent}px` }}
					onClick={() => onChange([...fields, createOutputField(defaultFieldType)])}
				>
					<Plus className="h-2.5 w-2.5" />
					{t('addField')}
				</Button>
			</div>
		</div>
	);
}
