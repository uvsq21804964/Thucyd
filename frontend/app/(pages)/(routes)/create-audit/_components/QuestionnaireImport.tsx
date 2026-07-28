/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import { useEffect, useState } from 'react';
import { FileJson, History, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';
import { QuestionnaireReference } from '@/lib/questionnaires';
import { cn } from '@/lib/utils';

export type DisplayCondition = {
  question_ref: number;
  operator:
    | 'eq'
    | 'neq'
    | 'lt'
    | 'lte'
    | 'gt'
    | 'gte'
    | 'in'
    | 'not_in'
    | 'answered'
    | 'unanswered';
  value?: number | number[];
};

export type QuestionnaireQuestion = {
  ref: number;
  catégorie: string;
  chantier: string;
  question: string;
  comment: null;
  'note numérique': null;
  'aide à la notation': string[];
  display_if?: DisplayCondition;
};

export type QuestionnaireSelection = {
  questionnaire?: QuestionnaireQuestion[];
  questionnaire_name?: string;
  questionnaire_version_id?: string;
};

const example: QuestionnaireQuestion[] = [
  {
    ref: 1,
    catégorie: 'Gouvernance',
    chantier: 'Organisation de la sécurité',
    question: 'Un responsable de la sécurité est-il désigné ?',
    comment: null,
    'note numérique': null,
    'aide à la notation': [
      '0 : Aucun responsable',
      '4 : Responsable désigné et missions formalisées',
    ],
  },
  {
    ref: 2,
    catégorie: 'Gouvernance',
    chantier: 'Organisation de la sécurité',
    question: 'Un plan de désignation doit-il être mis en place ?',
    comment: null,
    'note numérique': null,
    'aide à la notation': ['0 : Aucun plan', '4 : Plan validé et planifié'],
    display_if: { question_ref: 1, operator: 'lte', value: 2 },
  },
];

const expectedKeys = [
  'aide à la notation',
  'catégorie',
  'chantier',
  'comment',
  'note numérique',
  'question',
  'ref',
].sort();
const conditionKeys = ['operator', 'question_ref', 'value'];
const conditionOperators = [
  'eq',
  'neq',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'not_in',
  'answered',
  'unanswered',
];

export function parseQuestionnaire(value: string): QuestionnaireQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Le contenu ne respecte pas la syntaxe JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error(
      'Le questionnaire doit être un tableau contenant au moins une question.'
    );
  if (parsed.length > 1000)
    throw new Error('Le questionnaire est limité à 1 000 questions.');

  const refs = new Set<number>();
  parsed.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error(`Question ${index + 1} : un objet JSON est attendu.`);
    const question = item as Record<string, unknown>;
    const keys = Object.keys(question).sort();
    const conditionalKeys = [...expectedKeys, 'display_if'].sort();
    if (
      JSON.stringify(keys) !== JSON.stringify(expectedKeys) &&
      JSON.stringify(keys) !== JSON.stringify(conditionalKeys)
    )
      throw new Error(
        `Question ${
          index + 1
        } : les sept clés attendues et l'éventuelle clé "display_if" doivent être présentes sans autre clé.`
      );
    if (!Number.isInteger(question.ref) || Number(question.ref) < 1)
      throw new Error(
        `Question ${index + 1} : "ref" doit être un entier positif.`
      );
    if (refs.has(Number(question.ref)))
      throw new Error(
        `La référence ${question.ref} est utilisée plusieurs fois.`
      );
    refs.add(Number(question.ref));
    if (question.display_if !== undefined) {
      if (
        !question.display_if ||
        typeof question.display_if !== 'object' ||
        Array.isArray(question.display_if)
      )
        throw new Error(
          `Question ${index + 1} : "display_if" doit être un objet.`
        );
      const rule = question.display_if as Record<string, unknown>;
      if (
        !Object.keys(rule).every((key) => conditionKeys.includes(key)) ||
        !('question_ref' in rule) ||
        !('operator' in rule)
      )
        throw new Error(
          `Question ${index + 1} : la condition contient des clés invalides.`
        );
      const sourceRef = Number(rule.question_ref);
      if (
        !Number.isInteger(sourceRef) ||
        sourceRef === Number(question.ref) ||
        !refs.has(sourceRef)
      )
        throw new Error(
          `Question ${
            index + 1
          } : "question_ref" doit référencer une question placée plus tôt.`
        );
      if (
        typeof rule.operator !== 'string' ||
        !conditionOperators.includes(rule.operator)
      )
        throw new Error(
          `Question ${index + 1} : opérateur de condition invalide.`
        );
      if (rule.operator === 'answered' || rule.operator === 'unanswered') {
        if ('value' in rule)
          throw new Error(
            `Question ${index + 1} : "value" doit être omise avec ${
              rule.operator
            }.`
          );
      } else if (rule.operator === 'in' || rule.operator === 'not_in') {
        if (
          !Array.isArray(rule.value) ||
          rule.value.length === 0 ||
          !rule.value.every(
            (candidate) =>
              typeof candidate === 'number' && candidate >= 0 && candidate <= 4
          )
        )
          throw new Error(
            `Question ${
              index + 1
            } : "value" doit être une liste de notes entre 0 et 4.`
          );
      } else if (
        typeof rule.value !== 'number' ||
        rule.value < 0 ||
        rule.value > 4
      )
        throw new Error(
          `Question ${index + 1} : "value" doit être une note entre 0 et 4.`
        );
    }
    ['catégorie', 'chantier', 'question'].forEach((key) => {
      if (typeof question[key] !== 'string' || !String(question[key]).trim())
        throw new Error(
          `Question ${index + 1} : "${key}" doit être un texte non vide.`
        );
    });
    if (question.comment !== null || question['note numérique'] !== null)
      throw new Error(
        `Question ${
          index + 1
        } : "comment" et "note numérique" doivent valoir null.`
      );
    const help = question['aide à la notation'];
    if (
      !Array.isArray(help) ||
      !help.every((line) => typeof line === 'string' && line.trim())
    )
      throw new Error(
        `Question ${
          index + 1
        } : "aide à la notation" doit être un tableau de textes.`
      );
  });
  return parsed as QuestionnaireQuestion[];
}

const sourceLabel = (source: string) => {
  if (source === 'builtin') return 'Fourni';
  if (source === 'legacy') return 'Historique';
  return 'Personnalisé';
};

export default function QuestionnaireImport({
  onChange,
}: {
  onChange: (selection: QuestionnaireSelection, error: string) => void;
}) {
  const [mode, setMode] = useState<'default' | 'saved' | 'custom'>('default');
  const [content, setContent] = useState(JSON.stringify(example, null, 2));
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [versions, setVersions] = useState<QuestionnaireReference[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(true);
  const [selectedVersion, setSelectedVersion] = useState('');

  useEffect(() => {
    API.get<{ versions: QuestionnaireReference[] }>('questionnaire-versions')
      .then(({ data }) => {
        setVersions(data.versions);
        setSelectedVersion(data.versions[0]?.id ?? '');
      })
      .catch(() => undefined)
      .finally(() => setLoadingVersions(false));
  }, []);

  const updateCustom = (value: string, referentialName = name) => {
    setContent(value);
    const cleanName = referentialName.trim();
    if (cleanName.length < 2) {
      const message = 'Donnez un nom au référentiel (2 caractères minimum).';
      setError(message);
      onChange({}, message);
      return;
    }
    try {
      const parsed = parseQuestionnaire(value);
      setError('');
      onChange(
        { questionnaire: parsed, questionnaire_name: cleanName },
        ''
      );
    } catch (parseError) {
      const message =
        parseError instanceof Error
          ? parseError.message
          : 'Questionnaire invalide.';
      setError(message);
      onChange({}, message);
    }
  };

  const selectSavedVersion = (versionId: string) => {
    setSelectedVersion(versionId);
    if (versionId) {
      setError('');
      onChange({ questionnaire_version_id: versionId }, '');
    } else {
      const message = 'Sélectionnez une version de questionnaire.';
      setError(message);
      onChange({}, message);
    }
  };

  return (
    <div className="border-t border-slate-200 pt-6">
      <div className="flex items-start gap-3">
        <FileJson className="mt-0.5 h-5 w-5 text-violet-700" />
        <div>
          <h2 className="font-semibold text-slate-950">
            Questionnaire d’audit
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Le référentiel choisi et sa version seront conservés avec l’audit.
          </p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => {
            setMode('default');
            setError('');
            onChange({}, '');
          }}
          className={cn(
            'rounded-xl border p-3 text-left text-sm transition',
            mode === 'default'
              ? 'border-violet-600 bg-violet-50 text-violet-900'
              : 'border-slate-200 hover:bg-slate-50'
          )}
        >
          <span className="block font-semibold">Questionnaire fourni</span>
          <span className="mt-1 block text-xs opacity-70">
            Dernière version Thucyd
          </span>
        </button>
        <button
          type="button"
          disabled={loadingVersions || versions.length === 0}
          onClick={() => {
            setMode('saved');
            selectSavedVersion(selectedVersion || versions[0]?.id || '');
          }}
          className={cn(
            'rounded-xl border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
            mode === 'saved'
              ? 'border-violet-600 bg-violet-50 text-violet-900'
              : 'border-slate-200 hover:bg-slate-50'
          )}
        >
          <span className="block font-semibold">Version enregistrée</span>
          <span className="mt-1 block text-xs opacity-70">
            Réutiliser un référentiel précis
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('custom');
            updateCustom(content);
          }}
          className={cn(
            'rounded-xl border p-3 text-left text-sm transition',
            mode === 'custom'
              ? 'border-violet-600 bg-violet-50 text-violet-900'
              : 'border-slate-200 hover:bg-slate-50'
          )}
        >
          <span className="block font-semibold">Nouveau JSON</span>
          <span className="mt-1 block text-xs opacity-70">
            Créer ou faire évoluer un référentiel
          </span>
        </button>
      </div>

      {mode === 'saved' && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label
            htmlFor="questionnaire-version"
            className="text-sm font-medium text-slate-700"
          >
            Version à utiliser
          </label>
          <select
            id="questionnaire-version"
            value={selectedVersion}
            disabled={loadingVersions || versions.length === 0}
            onChange={(event) => selectSavedVersion(event.target.value)}
            className="form-select mt-2 h-11 w-full rounded-xl border-slate-300 text-sm focus:border-violet-500 focus:ring-violet-500"
          >
            {loadingVersions && <option>Chargement…</option>}
            {!loadingVersions && versions.length === 0 && (
              <option value="">Aucune version enregistrée</option>
            )}
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {version.name} · v{version.version} · {version.question_count}{' '}
                questions · {sourceLabel(version.source)}
              </option>
            ))}
          </select>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <History className="h-3.5 w-3.5" />
            Cette version restera figée pour garantir la traçabilité de l’audit.
          </p>
        </div>
      )}

      {mode === 'custom' && (
        <div className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="questionnaire-name"
              className="text-sm font-medium text-slate-700"
            >
              Nom du référentiel
            </label>
            <input
              id="questionnaire-name"
              value={name}
              maxLength={255}
              placeholder="Ex. ISO 27001 interne"
              onChange={(event) => {
                setName(event.target.value);
                updateCustom(content, event.target.value);
              }}
              className="form-input mt-2 h-11 w-full rounded-xl border-slate-300 text-sm focus:border-violet-500 focus:ring-violet-500"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Même nom + contenu modifié = nouvelle version automatique.
            </p>
          </div>
          <label
            htmlFor="questionnaire-file"
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/60 px-4 py-3 text-sm font-medium text-violet-800 hover:bg-violet-50"
          >
            <Upload className="h-4 w-4" />
            Importer un fichier .json
            <input
              id="questionnaire-file"
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file)
                  file
                    .text()
                    .then((value) => updateCustom(value))
                    .catch(() => {
                      const message = 'Impossible de lire ce fichier.';
                      setError(message);
                      onChange({}, message);
                    });
              }}
            />
          </label>
          <textarea
            aria-label="Questionnaire JSON"
            value={content}
            onChange={(event) => updateCustom(event.target.value)}
            rows={14}
            spellCheck={false}
            className="form-textarea w-full resize-y rounded-xl border-slate-300 font-mono text-xs leading-5 focus:border-violet-500 focus:ring-violet-500"
          />
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800">
            <code>display_if</code> est facultative. Elle doit toujours
            référencer une question placée plus tôt dans le tableau.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Les noms des clés, accents et valeurs <code>null</code> doivent
              être conservés exactement.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => updateCustom(JSON.stringify(example, null, 2))}
            >
              Réinitialiser l’exemple
            </Button>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
