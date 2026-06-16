"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Check,
  CheckCircle2,
  Clock,
  Lightbulb,
  ListChecks,
  Loader2,
  Pencil,
  Send,
  Trash2,
  X,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth/auth.context";
import {
  createSuggestion,
  deleteSuggestion,
  setSuggestionDone,
  updateSuggestionText,
} from "@/features/suggestions/suggestions.service";
import { useSuggestions } from "@/features/suggestions/suggestions.context";
import { ROUTES } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";
import type { Suggestion } from "@/types/domain";

type SuggestionFilter = "all" | "pending" | "done";

const FILTERS: { value: SuggestionFilter; label: string }[] = [
  { value: "all", label: "Todas" },
  { value: "pending", label: "Pendientes" },
  { value: "done", label: "Hechas" },
];

export default function SuggestionsPage() {
  const { appUser, isAdmin } = useAuth();
  const { suggestions: items, markAllSeen } = useSuggestions();
  const [filter, setFilter] = useState<SuggestionFilter>("all");

  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al entrar en la pestaña (y cada vez que llega una nueva mientras estás
  // aquí) marcamos todo como visto, así el aviso rojo del menú desaparece y no
  // vuelve a saltar hasta que entre OTRA sugerencia nueva.
  useEffect(() => {
    markAllSeen();
  }, [markAllSeen, items]);

  const stats = useMemo(() => {
    const all = items ?? [];
    const done = all.filter((s) => s.done).length;
    return { total: all.length, done, pending: all.length - done };
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (filter === "pending") return items.filter((s) => !s.done);
    if (filter === "done") return items.filter((s) => s.done);
    return items;
  }, [items, filter]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!appUser || !text.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await createSuggestion({
        userId: appUser.uid,
        authorName: appUser.username,
        authorAvatarUrl: appUser.avatarUrl ?? null,
        text,
      });
      setText("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo publicar la sugerencia."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Lightbulb className="h-6 w-6 text-gold" />
          Sugerencias
        </h1>
        <p className="text-sm text-muted-foreground">
          Propón mejoras para la app. Los administradores las marcan como hechas
          cuando se implementan.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Totales"
          value={stats.total}
          icon={<ListChecks className="h-5 w-5 text-primary" />}
        />
        <StatCard
          label="Hechas"
          value={stats.done}
          icon={<CheckCircle2 className="h-5 w-5 text-profit" />}
          accent="text-profit"
        />
        <StatCard
          label="Pendientes"
          value={stats.pending}
          icon={<Clock className="h-5 w-5 text-amber-500" />}
        />
      </div>

      {/* Nueva sugerencia */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Nueva sugerencia</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="¿Qué te gustaría mejorar o añadir?"
              maxLength={1000}
              rows={3}
              disabled={!appUser || submitting}
            />
            {error && <p className="text-sm text-loss">{error}</p>}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {text.length}/1000
              </span>
              <Button
                type="submit"
                size="sm"
                disabled={!appUser || !text.trim() || submitting}
                className="gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Publicar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Feed de sugerencias */}
      {filtered === null ? (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            Cargando sugerencias…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="px-6 py-8 text-center text-sm text-muted-foreground">
            {filter === "all"
              ? "Todavía no hay sugerencias. ¡Sé el primero en proponer algo!"
              : "No hay sugerencias para este filtro."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <SuggestionCard
              key={s.id}
              suggestion={s}
              currentUid={appUser?.uid ?? null}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted/50 p-2">{icon}</div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className={cn("text-xl font-bold", accent)}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function SuggestionCard({
  suggestion: s,
  currentUid,
  isAdmin,
}: {
  suggestion: Suggestion;
  currentUid: string | null;
  isAdmin: boolean;
}) {
  const canModify = isAdmin || (!!currentUid && s.userId === currentUid);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(s.text);
  const [busy, setBusy] = useState(false);

  // Si el texto cambia upstream (otra sesión lo editó) y no estamos editando,
  // sincronizamos el borrador para no mostrar una versión obsoleta al editar.
  useEffect(() => {
    if (!editing) setDraft(s.text);
  }, [s.text, editing]);

  const timestamp = s.createdAt
    ? formatDistanceToNow(s.createdAt.toDate(), { addSuffix: true, locale: es })
    : "";

  async function handleToggleDone() {
    if (!isAdmin || !currentUid) return;
    setBusy(true);
    try {
      await setSuggestionDone(s.id, !s.done, currentUid);
    } catch (err) {
      console.error("[suggestions] toggle done", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleSave() {
    if (!draft.trim()) return;
    setBusy(true);
    try {
      await updateSuggestionText(s.id, draft);
      setEditing(false);
    } catch (err) {
      console.error("[suggestions] edit", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("¿Eliminar esta sugerencia? No se puede deshacer.")) {
      return;
    }
    setBusy(true);
    try {
      await deleteSuggestion(s.id);
      // No reseteamos `busy`: la tarjeta desaparecerá al llegar el snapshot.
    } catch (err) {
      console.error("[suggestions] delete", err);
      setBusy(false);
    }
  }

  return (
    <Card className={cn(s.done && "border-l-4 border-l-profit")}>
      <CardContent className="flex items-start gap-3 p-4">
        <Link href={ROUTES.profile(s.userId)} className="shrink-0">
          <Avatar className="h-10 w-10">
            {s.authorAvatarUrl && <AvatarImage src={s.authorAvatarUrl} />}
            <AvatarFallback>{initials(s.authorName)}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={ROUTES.profile(s.userId)}
              className="text-sm font-semibold hover:underline"
            >
              {s.authorName}
            </Link>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {timestamp}
            </span>
            {s.updatedAt && (
              <span className="text-xs text-muted-foreground">· editada</span>
            )}
            <span className="ml-auto">
              {s.done ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-profit/15 px-2 py-0.5 text-xs font-semibold text-profit">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Hecha
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Pendiente
                </span>
              )}
            </span>
          </div>

          {editing ? (
            <div className="space-y-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={1000}
                rows={3}
                disabled={busy}
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={busy || !draft.trim()}
                  className="gap-1.5"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  Guardar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(s.text);
                  }}
                  disabled={busy}
                  className="gap-1.5"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">
              {s.text}
            </p>
          )}

          {!editing && (canModify || isAdmin) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {isAdmin && (
                <Button
                  size="sm"
                  variant={s.done ? "outline" : "default"}
                  onClick={handleToggleDone}
                  disabled={busy}
                  className="gap-1.5"
                >
                  {s.done ? (
                    <>
                      <X className="h-4 w-4" />
                      Marcar pendiente
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Marcar hecha
                    </>
                  )}
                </Button>
              )}
              {canModify && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(true)}
                    disabled={busy}
                    className="gap-1.5"
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleDelete}
                    disabled={busy}
                    className="gap-1.5 text-loss hover:text-loss"
                  >
                    <Trash2 className="h-4 w-4" />
                    Eliminar
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
