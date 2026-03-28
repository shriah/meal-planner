'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toast } from 'sonner';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  addCategory,
  deleteCategory,
  getCategoriesByKind,
  renameCategory,
} from '@/services/category-db';
import type { CategoryKind, CategoryRecord } from '@/types/category';

type DraftState = {
  kind: CategoryKind;
  name: string;
};

type RenameState = {
  id: number;
  kind: CategoryKind;
  originalName: string;
  name: string;
};

const COPY: Record<CategoryKind, { title: string; description: string; inputLabel: string }> = {
  base: {
    title: 'Base Categories',
    description: 'Use base categories to group staples for components, rules, and generator matching.',
    inputLabel: 'New base category name',
  },
  extra: {
    title: 'Extra Categories',
    description: 'Use extra categories to organize accompaniments and rule requirements.',
    inputLabel: 'New extra category name',
  },
};

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function isUniqueName(categories: CategoryRecord[] | undefined, value: string, excludeId?: number) {
  const normalized = normalizeName(value);
  if (!normalized) {
    return false;
  }

  return !(categories ?? []).some((category) =>
    category.id !== excludeId && normalizeName(category.name) === normalized,
  );
}

function PlaceholderRows() {
  return (
    <div className="space-y-2" aria-label="Category placeholders">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="h-12 rounded-md border border-dashed border-border bg-muted/40"
        />
      ))}
    </div>
  );
}

export function CategoryManager() {
  const [open, setOpen] = useState(false);
  const [activeKind, setActiveKind] = useState<CategoryKind>('base');
  const [draft, setDraft] = useState<DraftState | null>(null);
  const [renameState, setRenameState] = useState<RenameState | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const baseCategories = useLiveQuery(() => getCategoriesByKind('base'), [], undefined);
  const extraCategories = useLiveQuery(() => getCategoriesByKind('extra'), [], undefined);
  const activeCategories = activeKind === 'base' ? baseCategories : extraCategories;

  useEffect(() => {
    if (!open) {
      setActiveKind('base');
      setDraft(null);
      setRenameState(null);
      setDeleteId(null);
    }
  }, [open]);

  const orderedCategories = useMemo(() => activeCategories ?? [], [activeCategories]);
  const draftIsActive = draft?.kind === activeKind;
  const draftIsValid = draftIsActive && isUniqueName(activeCategories, draft.name);
  const renameIsValid = renameState?.kind === activeKind
    && isUniqueName(activeCategories, renameState.name, renameState.id);

  async function handleAddCategory() {
    if (!draft || !draftIsValid || saving) {
      return;
    }

    setSaving(true);
    try {
      await addCategory({ kind: draft.kind, name: draft.name.trim() });
      setDraft({ kind: draft.kind, name: '' });
    } catch {
      toast.error('Could not save category changes. Check the name and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRenameCategory() {
    if (!renameState || !renameIsValid || saving) {
      return;
    }

    setSaving(true);
    try {
      await renameCategory(renameState.id, renameState.name.trim());
      setRenameState(null);
    } catch {
      toast.error('Could not save category changes. Check the name and try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCategory(id: number) {
    const categories = activeKind === 'base' ? baseCategories : extraCategories;
    const category = (categories ?? []).find((item) => item.id === id);
    if (!category || saving) {
      return;
    }

    setSaving(true);
    try {
      await deleteCategory(id);
      setDeleteId(null);
    } catch {
      toast.error('Could not save category changes. Check the name and try again.');
    } finally {
      setSaving(false);
    }
  }

  function renderCategoryRow(category: CategoryRecord) {
    const isRenaming = renameState?.id === category.id;
    const isDeleting = deleteId === category.id;
    const renameError = isRenaming && !renameIsValid;

    return (
      <div key={category.id} className="space-y-2">
        <div
          className="flex min-h-[48px] items-center gap-3 rounded-md border border-border px-3 py-2"
          role="listitem"
          aria-label={category.name}
        >
          {isRenaming ? (
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Input
                aria-label={`Rename ${category.name}`}
                autoFocus
                value={renameState.name}
                onChange={(event) =>
                  setRenameState((current) => current ? { ...current, name: event.target.value } : current)
                }
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setRenameState(null);
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleRenameCategory();
                  }
                }}
              />
              {renameError && (
                <p className="text-xs text-destructive">Enter a unique category name.</p>
              )}
            </div>
          ) : (
            <span className="min-w-0 flex-1 text-sm">{category.name}</span>
          )}
          <div className="flex shrink-0 items-center gap-2">
            {isRenaming ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleRenameCategory()}
                  disabled={!renameIsValid || saving}
                >
                  Save Name
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRenameState(null)}
                >
                  Stop Renaming
                </Button>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDraft(null);
                    setDeleteId(null);
                    setRenameState({
                      id: category.id!,
                      kind: category.kind,
                      originalName: category.name,
                      name: category.name,
                    });
                  }}
                >
                  Rename Category
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setRenameState(null);
                    setDeleteId((current) => current === category.id ? null : category.id!);
                  }}
                >
                  Delete Category
                </Button>
              </>
            )}
          </div>
        </div>
        {isDeleting && (
          <Alert variant="destructive" className="flex items-center justify-between gap-2">
            <span className="text-xs">
              {`Delete category: Delete “${category.name}”? Components and rules that use it will be cleaned up automatically.`}
            </span>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => void handleDeleteCategory(category.id!)}
                disabled={saving}
                aria-label={`Delete ${category.name} cleanup is automatic`}
              >
                Delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setDeleteId(null)}
              >
                Keep Category
              </Button>
            </div>
          </Alert>
        )}
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Manage Categories
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Manage Categories</SheetTitle>
            <SheetDescription>
              Add, rename, or delete base and extra categories without leaving the Library page.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
            <Tabs
              value={activeKind}
              onValueChange={(value) => {
                setActiveKind(value as CategoryKind);
                setDraft(null);
                setRenameState(null);
                setDeleteId(null);
              }}
            >
              <TabsList>
                <TabsTrigger value="base">Base Categories</TabsTrigger>
                <TabsTrigger value="extra">Extra Categories</TabsTrigger>
              </TabsList>
              {(['base', 'extra'] as const).map((kind) => {
                const categories = kind === 'base' ? baseCategories : extraCategories;
                const kindDraft = draft?.kind === kind ? draft : null;
                const invalidDraft = kindDraft && !isUniqueName(categories, kindDraft.name);
                const kindCopy = COPY[kind];
                const isLoading = categories === undefined;
                const isEmpty = (categories ?? []).length === 0 && !kindDraft;

                return (
                  <TabsContent key={kind} value={kind} className="mt-4 min-h-0 flex-1">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h2 className="font-heading text-[18px] font-semibold leading-[1.3]">
                          {kindCopy.title}
                        </h2>
                        <p className="text-xs font-semibold text-muted-foreground">
                          {kindCopy.description}
                        </p>
                      </div>
                      <Separator />
                      <div className="space-y-3">
                        {kindDraft ? (
                          <div className="rounded-md border border-border px-3 py-3">
                            <div className="space-y-2">
                              <Input
                                aria-label={kindCopy.inputLabel}
                                autoFocus
                                value={kindDraft.name}
                                onChange={(event) =>
                                  setDraft({ kind, name: event.target.value })
                                }
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    setDraft(null);
                                  }
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleAddCategory();
                                  }
                                }}
                              />
                              {invalidDraft && (
                                <p className="text-xs text-destructive">Enter a unique category name.</p>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleAddCategory()}
                                  disabled={!draftIsValid || saving}
                                >
                                  Add Category
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDraft(null)}
                                >
                                  Discard Draft Category
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            onClick={() => {
                              setRenameState(null);
                              setDeleteId(null);
                              setDraft({ kind, name: '' });
                            }}
                          >
                            Add Category
                          </Button>
                        )}

                        {isLoading ? (
                          <PlaceholderRows />
                        ) : isEmpty ? (
                          <div className="rounded-md border border-dashed border-border px-4 py-12 text-center">
                            <p className="text-sm font-semibold">No categories yet</p>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Add a category to make it available in components, rules, and generator matching.
                            </p>
                          </div>
                        ) : (
                          <div className="max-h-[28rem] space-y-2 overflow-y-auto" role="list">
                            {(categories ?? []).map(renderCategoryRow)}
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
