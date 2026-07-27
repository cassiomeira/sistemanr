// Consulta pública de CNPJ (dados abertos da Receita Federal)
// Fontes públicas gratuitas, com fallback entre elas.

function fmtEndereco(o) {
  const p = [o.logradouro || o.descricao_tipo_de_logradouro, o.numero, o.complemento, o.bairro].filter(Boolean).join(', ');
  const cidade = [o.municipio, o.uf].filter(Boolean).join('/');
  const cep = o.cep ? 'CEP ' + o.cep : '';
  return [p, cidade, cep].filter(Boolean).join(' - ');
}

function normalizarMinhaReceita(d) {
  return {
    cnpj: d.cnpj,
    razao_social: d.razao_social || '',
    nome_fantasia: d.nome_fantasia || '',
    capital_social: parseFloat(d.capital_social) || 0,
    natureza_juridica: d.natureza_juridica || '',
    porte: d.porte || d.descricao_porte || d.codigo_porte || '',
    situacao: d.descricao_situacao_cadastral || '',
    data_abertura: d.data_inicio_atividade || '',
    telefone: [d.ddd_telefone_1, d.ddd_telefone_2].filter(Boolean).join(' / '),
    email: d.email || '',
    endereco: fmtEndereco(d),
    municipio: d.municipio || '',
    uf: d.uf || '',
    cnae: (d.cnae_fiscal ? d.cnae_fiscal + ' - ' : '') + (d.cnae_fiscal_descricao || ''),
    simples: d.opcao_pelo_simples === true ? 'Optante' : (d.opcao_pelo_simples === false ? 'Não optante' : ''),
    socios: (d.qsa || []).map(s => ({
      nome: s.nome_socio || s.nome || '',
      qualificacao: s.qualificacao_socio || s.qual || '',
      entrada: s.data_entrada_sociedade || '',
    })),
    fonte: 'Receita Federal (dados abertos)',
  };
}

function normalizarBrasilApi(d) {
  return {
    cnpj: d.cnpj,
    razao_social: d.razao_social || d.nome_empresarial || '',
    nome_fantasia: d.nome_fantasia || '',
    capital_social: parseFloat(d.capital_social) || 0,
    natureza_juridica: d.natureza_juridica || d.descricao_natureza_juridica || '',
    porte: d.porte || d.descricao_porte || '',
    situacao: d.descricao_situacao_cadastral || d.situacao_cadastral || '',
    data_abertura: d.data_inicio_atividade || '',
    telefone: [d.ddd_telefone_1, d.ddd_telefone_2].filter(Boolean).join(' / '),
    email: d.email || '',
    endereco: fmtEndereco(d),
    municipio: d.municipio || '',
    uf: d.uf || '',
    cnae: (d.cnae_fiscal ? d.cnae_fiscal + ' - ' : '') + (d.cnae_fiscal_descricao || ''),
    simples: (d.opcao_pelo_simples && d.opcao_pelo_simples.optante) ? 'Optante' : '',
    socios: (d.qsa || []).map(s => ({
      nome: s.nome_socio || s.nome || '',
      qualificacao: s.qualificacao_socio || s.codigo_qualificacao_socio || '',
      entrada: s.data_entrada_sociedade || '',
    })),
    fonte: 'Receita Federal (via BrasilAPI)',
  };
}

async function consultarCnpj(cnpjRaw) {
  const cnpj = (cnpjRaw || '').replace(/\D/g, '');
  if (cnpj.length !== 14) return { error: 'CNPJ inválido (precisa ter 14 dígitos)' };
  // 1) minhareceita.org — espelho dos dados abertos da Receita, traz QSA e capital social
  try {
    const r = await fetch('https://minhareceita.org/' + cnpj, { headers: { Accept: 'application/json' } });
    if (r.ok) { const d = await r.json(); if (d && d.razao_social) return normalizarMinhaReceita(d); }
  } catch (e) {}
  // 2) BrasilAPI (fallback)
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
    if (r.ok) { const d = await r.json(); if (d && (d.razao_social || d.nome_empresarial)) return normalizarBrasilApi(d); }
  } catch (e) {}
  return { error: 'Não consegui consultar este CNPJ agora (as fontes públicas oscilam). Tente novamente em instantes.' };
}

module.exports = { consultarCnpj };
