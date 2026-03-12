/**
 * Phone Number Validation and Formatting
 *
 * Uses libphonenumber-js for robust international phone validation
 * Ported from NossoFlow
 */

import { parsePhoneNumber, isValidPhoneNumber, type CountryCode } from 'libphonenumber-js';

export interface PhoneValidationResult {
  isValid: boolean;
  error?: string;
  metadata?: {
    country?: string;
    countryCallingCode?: string;
    nationalNumber?: string;
    type?: string;
  };
}

export interface ProcessedPhone {
  normalized: string;
  validation: PhoneValidationResult;
}

/**
 * Valida um número de telefone usando `libphonenumber-js`.
 *
 * Além de validar formato e plausibilidade, tenta identificar país e tipo.
 * Para uso com WhatsApp, também verifica se o tipo do número é compatível
 * com celular (o WhatsApp não aceita fixo).
 *
 * @param phone Número a validar (pode conter espaços, hífens e parênteses).
 * @param defaultCountry País padrão (ISO 3166-1 alpha-2) quando o número não tiver prefixo.
 * @returns Resultado de validação, com `error` detalhado quando inválido.
 */
export function validatePhoneNumber(
  phone: string,
  defaultCountry: CountryCode = 'BR'
): PhoneValidationResult {
  const trimmed = phone.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: 'Número de telefone não pode ser vazio',
    };
  }

  try {
    // Check if valid using libphonenumber-js
    const isValid = isValidPhoneNumber(trimmed, defaultCountry);

    if (!isValid) {
      // Try to parse to get more specific error
      try {
        const parsed = parsePhoneNumber(trimmed, defaultCountry);

        if (!parsed) {
          return {
            isValid: false,
            error: 'Formato de número inválido',
          };
        }

        // Check if it's a possible number
        if (!parsed.isPossible()) {
          const countryLabel = parsed.country || 'este país';
          return {
            isValid: false,
            error: `Número inválido para ${countryLabel}. Verifique a quantidade de dígitos.`,
          };
        }

        return {
          isValid: false,
          error: 'Número não é válido para WhatsApp',
        };
      } catch {
        return {
          isValid: false,
          error: 'Formato de número inválido. Use formato internacional (+5521999999999)',
        };
      }
    }

    // Parse to verify it's a mobile number (WhatsApp requires mobile)
    const parsed = parsePhoneNumber(trimmed, defaultCountry);

    if (parsed && parsed.getType() && !['MOBILE', 'FIXED_LINE_OR_MOBILE'].includes(parsed.getType()!)) {
      return {
        isValid: false,
        error: 'WhatsApp requer números de celular (não aceita fixos)',
      };
    }

    return {
      isValid: true,
      metadata: {
        country: parsed?.country,
        countryCallingCode: parsed?.countryCallingCode,
        nationalNumber: parsed?.nationalNumber,
        type: parsed?.getType(),
      }
    };
  } catch {
    return {
      isValid: false,
      error: 'Formato inválido. Use formato internacional: +5521999999999',
    };
  }
}

/**
 * Valida um número de telefone para uso geral (contato/perfil), sem regra específica do WhatsApp.
 *
 * Diferente de {@link validatePhoneNumber}, este método **não exige** que o número seja celular.
 *
 * @param phone Número a validar (pode conter espaços, hífens e parênteses).
 * @param defaultCountry País padrão (ISO 3166-1 alpha-2) quando o número não tiver prefixo.
 * @returns Resultado de validação, com `error` detalhado quando inválido.
 */
export function validateAnyPhoneNumber(
  phone: string,
  defaultCountry: CountryCode = 'BR'
): PhoneValidationResult {
  const trimmed = phone.trim();

  if (!trimmed) {
    return {
      isValid: false,
      error: 'Número de telefone não pode ser vazio',
    };
  }

  try {
    const isValid = isValidPhoneNumber(trimmed, defaultCountry);
    if (!isValid) {
      try {
        const parsed = parsePhoneNumber(trimmed, defaultCountry);
        if (!parsed) {
          return { isValid: false, error: 'Formato de número inválido' };
        }
        if (!parsed.isPossible()) {
          const countryLabel = parsed.country || 'este país';
          return {
            isValid: false,
            error: `Número inválido para ${countryLabel}. Verifique a quantidade de dígitos.`,
          };
        }
        return { isValid: false, error: 'Número de telefone inválido' };
      } catch {
        return {
          isValid: false,
          error: 'Formato de número inválido. Use formato internacional (+5521999999999)',
        };
      }
    }

    const parsed = parsePhoneNumber(trimmed, defaultCountry);
    return {
      isValid: true,
      metadata: {
        country: parsed?.country,
        countryCallingCode: parsed?.countryCallingCode,
        nationalNumber: parsed?.nationalNumber,
        type: parsed?.getType(),
      },
    };
  } catch {
    return {
      isValid: false,
      error: 'Formato inválido. Use formato internacional: +5521999999999',
    };
  }
}

/**
 * Normaliza um número de telefone para o formato internacional E.164.
 *
 * O formato exigido pela API do WhatsApp Cloud é `+XXXXXXXXXXX` (sem espaços).
 *
 * Estratégia de normalização:
 * 1. Se começa com '+', respeita como está e usa libphonenumber para parsear
 * 2. Se começa com '00' (prefixo internacional), converte para '+' e tenta parsear
 * 3. Se tem 12-15 dígitos (parece internacional), tenta detectar automaticamente
 * 4. Caso contrário, assume Brasil (defaultCountry)
 *
 * @param phone Número a normalizar.
 * @param defaultCountry País padrão quando não estiver explícito no número.
 * @returns Número normalizado em E.164 (ex.: `+5521999999999`).
 */
export function normalizePhoneNumber(
  phone: string,
  defaultCountry: CountryCode = 'BR'
): string {
  // Limpa caracteres não numéricos (preserva +)
  let cleaned = phone.replace(/[^\d+]/g, '');

  if (!cleaned) return '';

  // 1. Se começa com '+', respeita como está
  if (cleaned.startsWith('+')) {
    try {
      const parsed = parsePhoneNumber(cleaned);
      if (parsed && parsed.isValid()) {
        return ensureBrazilian9thDigit(parsed.number);
      }
    } catch {
      // Se falhar, retorna como está (melhor que perder dados)
    }
    // Mesmo sem parse válido, tenta corrigir o nono dígito BR
    return ensureBrazilian9thDigit(cleaned);
  }

  // 2. Se começa com '00' (prefixo de discagem internacional)
  //    Tenta parsear como internacional imediatamente
  if (cleaned.startsWith('00') && cleaned.length >= 12) {
    const withoutPrefix = cleaned.slice(2);
    const asInternational = '+' + withoutPrefix;
    try {
      const parsed = parsePhoneNumber(asInternational);
      if (parsed && parsed.isPossible()) {
        return ensureBrazilian9thDigit(parsed.number);
      }
    } catch {
      // Se falhar, continua com o número sem o prefixo 00
    }
    // Atualiza cleaned para próximas verificações
    cleaned = withoutPrefix;
  }

  // 3. Se tem 12-15 dígitos, pode ser internacional sem '+'
  //    Números BR com DDI: 55 + DDD(2) + número(8-9) = 12-13 dígitos
  if (cleaned.length >= 12 && cleaned.length <= 15) {
    const asInternational = '+' + cleaned;
    try {
      const parsed = parsePhoneNumber(asInternational);
      // Usa isPossible() ao invés de isValid() para ser mais permissivo
      // isValid() pode rejeitar números válidos que não estão no metadata
      if (parsed && parsed.isPossible()) {
        return ensureBrazilian9thDigit(parsed.number);
      }
    } catch {
      // Continua para fallback
    }
    // Fallback: tenta corrigir nono dígito BR mesmo sem parse
    return ensureBrazilian9thDigit(asInternational);
  }

  // 4. Números com 10-11 dígitos: assume Brasil (celular ou fixo)
  //    Nota: 11 dígitos poderia ser USA, mas como defaultCountry=BR, priorizamos BR
  if (cleaned.length === 10 || cleaned.length === 11) {
    try {
      const parsed = parsePhoneNumber(cleaned, defaultCountry);
      if (parsed && parsed.isValid()) {
        return ensureBrazilian9thDigit(parsed.number);
      }
    } catch {
      // Fallback manual
    }
    // Fallback: adiciona +55 diretamente
    return ensureBrazilian9thDigit('+55' + cleaned);
  }

  // 5. Fallback geral: tenta com país padrão
  try {
    const parsed = parsePhoneNumber(cleaned, defaultCountry);
    if (parsed) {
      return ensureBrazilian9thDigit(parsed.number);
    }
  } catch {
    // Último recurso
  }

  // Número com formato desconhecido - retorna com + para não perder dados
  return '+' + cleaned;
}

/**
 * Garante que números brasileiros de celular tenham o nono dígito (9).
 *
 * O Meta WhatsApp Cloud API às vezes retorna números BR sem o nono dígito
 * (ex: +554584311898 ao invés de +5545984311898). Isso causa mismatch no
 * lookup de conversas do inbox.
 *
 * Regra: Se é BR (+55), DDD (2 dígitos), e o número local tem 8 dígitos
 * começando com [6-9] (indicando celular), adiciona o 9.
 *
 * Exemplos:
 *   +554584311898  → +5545984311898  (adiciona 9)
 *   +5545984311898 → +5545984311898  (já tem, não muda)
 *   +551133334444  → +551133334444   (fixo, não muda)
 *   +14155552671   → +14155552671    (não é BR, não muda)
 */
function ensureBrazilian9thDigit(phone: string): string {
  // Só aplica para números brasileiros (+55)
  if (!phone.startsWith('+55')) return phone;

  // Remove o +55 para analisar o restante
  const afterCountryCode = phone.slice(3); // DDD + número local

  // Formato esperado: DDD(2) + número(8 ou 9 dígitos) = 10 ou 11 dígitos
  // Se tem 10 dígitos (DDD + 8 dígitos) e o número local começa com [6-9], falta o 9
  if (afterCountryCode.length === 10) {
    const ddd = afterCountryCode.slice(0, 2);
    const localNumber = afterCountryCode.slice(2); // 8 dígitos

    // Celulares BR começam com 9[6-9]XXX-XXXX (formato com nono dígito)
    // Sem o nono dígito: [6-9]XXX-XXXX
    // Fixos começam com [2-5], não precisam do nono dígito
    const firstDigit = localNumber[0];
    if (firstDigit && ['6', '7', '8', '9'].includes(firstDigit)) {
      return `+55${ddd}9${localNumber}`;
    }
  }

  return phone;
}

/**
 * Extrai o DDI (country calling code) de um telefone.
 *
 * Ex.: "+5521999999999" -> "55"
 *
 * @param phone Telefone em formato livre (com/sem +).
 * @param defaultCountry País padrão quando não houver prefixo.
 * @returns DDI como string numérica (sem "+") ou null quando não for possível.
 */
export function getCountryCallingCodeFromPhone(
  phone: string,
  defaultCountry: CountryCode = 'BR'
): string | null {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return null;
  try {
    const parsed = parsePhoneNumber(trimmed, defaultCountry);
    const code = parsed?.countryCallingCode;
    return code ? String(code) : null;
  } catch {
    return null;
  }
}

/**
 * Formata um número para exibição (com espaçamento/pontuação amigáveis).
 *
 * @param phone Número em qualquer formato.
 * @param style Estilo de formatação (`international`, `national` ou `e164`).
 * @returns Número formatado para display.
 */
export function formatPhoneNumberDisplay(
  phone: string,
  style: 'international' | 'national' | 'e164' = 'international'
): string {
  try {
    const parsed = parsePhoneNumber(phone);

    if (parsed) {
      if (style === 'e164') {
        return parsed.number; // +5521999999999
      }
      return style === 'international'
        ? parsed.formatInternational() // +55 21 99999-9999
        : parsed.formatNational();      // (21) 99999-9999
    }

    return phone;
  } catch {
    return phone;
  }
}

/**
 * Valida e normaliza um número de telefone em um único passo.
 *
 * @param phone Número a processar.
 * @param defaultCountry País padrão quando não estiver explícito no número.
 * @returns Objeto contendo `normalized` (E.164) e `validation`.
 */
export function processPhoneNumber(
  phone: string,
  defaultCountry: CountryCode = 'BR'
): ProcessedPhone {
  const validation = validatePhoneNumber(phone, defaultCountry);
  const normalized = normalizePhoneNumber(phone, defaultCountry);

  return {
    normalized,
    validation,
  };
}

/**
 * Extrai informações de país a partir de um número.
 *
 * @param phone Número a analisar.
 * @returns Dados do país (inclui DDI e bandeira) ou `null` se não for possível interpretar.
 */
export function getPhoneCountryInfo(phone: string): {
  country: CountryCode | undefined;
  callingCode: string | undefined;
  flag: string | undefined;
} | null {
  try {
    const parsed = parsePhoneNumber(phone);

    if (parsed) {
      let flag: string | undefined;
      if (parsed.country) {
        flag = getCountryFlag(parsed.country);
      }

      return {
        country: parsed.country,
        callingCode: parsed.countryCallingCode,
        flag,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Gets emoji flag for country code
 */
function getCountryFlag(countryCode: string): string {
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

/**
 * Valida (em lote) vários números de telefone.
 *
 * Útil para validação de importação via CSV.
 *
 * @param phones Lista de números a validar.
 * @returns Lista de resultados contendo o original, o normalizado e a validação.
 */
export function validatePhoneNumbers(phones: string[]): Array<{
  phone: string;
  normalized: string;
  validation: PhoneValidationResult;
}> {
  return phones.map(phone => {
    const result = processPhoneNumber(phone);
    return {
      phone,
      ...result,
    };
  });
}
