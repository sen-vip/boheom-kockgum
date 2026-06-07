/* 보험콕검 v0.2.5 - 서버 전송 없는 브라우저 내부 분석 */
(() => {
  const MAX_FILES = 10;
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
  const MAX_PDF_PAGES = 20;

  const state = {
    files: [],
    rows: [],
    fileResults: [],
    pointGroups: {},
    structuredResult: null,
    opinion: '',
    extractedTexts: []
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  const els = {
    fileInput: $('#fileInput'),
    selectFileButton: $('#selectFileButton'),
    dropzone: $('#dropzone'),
    fileListSection: $('#fileListSection'),
    fileList: $('#fileList'),
    fileTotalText: $('#fileTotalText'),
    runButton: $('#runButton'),
    resetButton: $('#resetButton'),
    progressSection: $('#progressSection'),
    progressText: $('#progressText'),
    progressFill: $('#progressFill'),
    resultsSection: $('#resultsSection'),
    checklistBody: $('#checklistBody'),
    structuredResult: $('#structuredResult'),
    fileAnalysis: $('#fileAnalysis'),
    pointsContent: $('#pointsContent'),
    opinionText: $('#opinionText'),
    okCount: $('#okCount'),
    warnCount: $('#warnCount'),
    missingCount: $('#missingCount'),
    hardCount: $('#hardCount'),
    copyOpinionButton: $('#copyOpinionButton'),
    saveTxtButton: $('#saveTxtButton'),
    downloadCsvButton: $('#downloadCsvButton'),
    copyAllButton: $('#copyAllButton'),
    topButton: $('#topButton'),
    floatingTopButton: $('#floatingTopButton'),
    bottomStatus: $('#bottomStatus'),
    bottomRunButton: $('#bottomRunButton'),
    bottomResetButton: $('#bottomResetButton'),
    heroResetButton: $('#heroResetButton'),
    finalResetButton: $('#finalResetButton'),
    inputSummary: $('#inputSummary'),
    inputSummaryText: $('#inputSummaryText')
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  });

  els.selectFileButton.addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (event) => addFiles(event.target.files));
  els.runButton.addEventListener('click', runAnalysis);
  els.resetButton.addEventListener('click', resetAll);
  els.copyOpinionButton.addEventListener('click', copyOpinion);
  els.saveTxtButton.addEventListener('click', saveOpinionTxt);
  els.downloadCsvButton.addEventListener('click', downloadCsv);
  els.copyAllButton.addEventListener('click', copyAllResults);
  els.topButton.addEventListener('click', scrollTop);
  els.floatingTopButton.addEventListener('click', scrollTop);
  els.bottomRunButton?.addEventListener('click', runAnalysis);
  els.bottomResetButton?.addEventListener('click', resetAll);
  els.heroResetButton?.addEventListener('click', resetAll);
  els.finalResetButton?.addEventListener('click', resetAll);
  $$('input[type="checkbox"]').forEach(input => input.addEventListener('change', updateBottomAction));
  updateBottomAction();

  ['dragenter', 'dragover'].forEach(type => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach(type => {
    els.dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      els.dropzone.classList.remove('is-dragover');
    });
  });
  els.dropzone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

  function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;

    const accepted = [];
    const messages = [];
    const currentNames = new Set(state.files.map(file => `${file.name}-${file.size}`));

    for (const file of incoming) {
      const extOk = /\.(pdf|jpg|jpeg|png)$/i.test(file.name);
      if (!extOk) {
        messages.push(`${file.name}: 지원하지 않는 형식입니다.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        messages.push(`${file.name}: 파일 1개당 10MB 이하를 권장합니다.`);
      }
      if (state.files.length + accepted.length >= MAX_FILES) {
        messages.push('파일은 최대 10개까지 선택할 수 있습니다.');
        break;
      }
      const key = `${file.name}-${file.size}`;
      if (currentNames.has(key)) continue;
      accepted.push(file);
    }

    const nextTotal = [...state.files, ...accepted].reduce((sum, file) => sum + file.size, 0);
    if (nextTotal > MAX_TOTAL_SIZE) {
      alert('전체 파일 용량은 50MB 이하를 권장합니다. 파일 수나 용량을 줄여주세요.');
      return;
    }

    state.files.push(...accepted);
    els.fileInput.value = '';
    renderFileList();
    updateStep(state.files.length ? 3 : 1);

    if (messages.length) alert(messages.join('\n'));
  }

  function renderFileList() {
    els.fileList.innerHTML = '';
    if (!state.files.length) {
      els.fileListSection.classList.add('hidden');
      els.runButton.disabled = true;
    if (els.bottomRunButton) els.bottomRunButton.disabled = true;
      if (els.bottomRunButton) els.bottomRunButton.disabled = true;
      updateBottomAction();
      return;
    }

    els.fileListSection.classList.remove('hidden');
    els.runButton.disabled = false;
    if (els.bottomRunButton) els.bottomRunButton.disabled = false;
    updateBottomAction();
    const totalSize = state.files.reduce((sum, file) => sum + file.size, 0);
    els.fileTotalText.textContent = `총 ${state.files.length}개 파일 · ${formatBytes(totalSize)}`;

    state.files.forEach((file, index) => {
      const li = document.createElement('li');
      li.className = 'file-item';
      li.innerHTML = `
        <span class="file-name">${index + 1}. ${escapeHtml(file.name)}</span>
        <span class="file-size">${formatBytes(file.size)}</span>
        <button type="button" class="delete-btn" data-index="${index}">삭제</button>
      `;
      els.fileList.appendChild(li);
    });

    $$('.delete-btn').forEach(button => {
      button.addEventListener('click', () => {
        state.files.splice(Number(button.dataset.index), 1);
        renderFileList();
        updateStep(state.files.length ? 3 : 1);
      });
    });
  }

  async function runAnalysis() {
    if (!state.files.length) return;
    updateStep(4);
    showProgress(0, '현재 진행: 분석 준비 중');
    els.progressSection.classList.remove('hidden');
    els.resultsSection.classList.add('hidden');
    els.runButton.disabled = true;
    if (els.bottomRunButton) els.bottomRunButton.disabled = true;

    state.extractedTexts = [];
    state.fileResults = [];

    try {
      for (let i = 0; i < state.files.length; i += 1) {
        const file = state.files[i];
        const baseProgress = Math.round((i / state.files.length) * 100);
        showProgress(baseProgress, `현재 진행: ${i + 1} / ${state.files.length}개 파일 분석 중`);

        let text = '';
        let method = '텍스트 추출';
        let warning = '';

        try {
          if (/\.pdf$/i.test(file.name)) {
            const result = await extractPdfText(file, (page, total) => {
              const current = Math.round(((i + page / Math.max(total, 1)) / state.files.length) * 100);
              showProgress(current, `현재 진행: ${i + 1} / ${state.files.length}개 파일 · PDF ${page}/${total}쪽 처리 중`);
            });
            text = result.text;
            method = result.method;
            warning = result.warning;
          } else {
            method = '이미지 OCR';
            const imageResult = await extractImageText(file, (progress, phase) => {
              const current = Math.round(((i + progress) / state.files.length) * 100);
              const phaseText = phase === 'enhanced' ? '이미지 보정 OCR 중' : '이미지 OCR 중';
              showProgress(current, `현재 진행: ${i + 1} / ${state.files.length}개 파일 · ${phaseText}`);
            });
            text = imageResult.text;
            method = imageResult.method;
            warning = imageResult.warning || warning;
          }
        } catch (error) {
          warning = `분석 오류: ${error.message || '알 수 없는 오류'}`;
        }

        const normalized = normalizeText(text);
        state.extractedTexts.push({ file, text: normalized, rawText: text, method, warning });
        state.fileResults.push(buildFileResult(file, normalized, method, warning));
      }

      showProgress(100, '현재 진행: 결과 정리 중');
      let result;
      try {
        result = buildChecklist(state.extractedTexts);
      } catch (error) {
        console.error('[보험콕검] 결과 정리 오류', error);
        const message = error?.message || '알 수 없는 오류';
        result = {
          rows: [{ item: '분석 오류', status: '분석 어려움', detail: `결과 정리 중 오류가 발생했습니다. ${message}` }],
          pointGroups: { '분석 오류': [`결과 정리 중 오류가 발생했습니다. ${message}`] },
          structuredResult: buildFallbackStructuredResult(message)
        };
      }
      state.rows = result.rows;
      state.pointGroups = result.pointGroups;
      state.structuredResult = result.structuredResult;
      state.opinion = buildOpinion(result.rows, result.structuredResult);
      renderResults();
      updateStep(5);
    } finally {
      els.runButton.disabled = false;
      if (els.bottomRunButton) els.bottomRunButton.disabled = false;
      setTimeout(() => els.progressSection.classList.add('hidden'), 250);
    }
  }

  async function extractPdfText(file, onPage) {
    if (!window.pdfjsLib) throw new Error('PDF 분석 라이브러리를 불러오지 못했습니다.');

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = Math.min(pdf.numPages, MAX_PDF_PAGES);
    let warning = pdf.numPages > MAX_PDF_PAGES ? `PDF ${pdf.numPages}쪽 중 ${MAX_PDF_PAGES}쪽까지만 분석했습니다.` : '';
    let text = '';

    for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
      onPage?.(pageNo, totalPages);
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const pageText = content.items.map(item => item.str).join(' ');
      text += `\n--- page ${pageNo} ---\n${pageText}`;
    }

    if (text.trim().length >= 30) {
      return { text, method: 'PDF 텍스트 추출', warning };
    }

    // 텍스트가 거의 없는 PDF는 스캔본으로 보고 OCR을 시도한다.
    let ocrText = '';
    for (let pageNo = 1; pageNo <= totalPages; pageNo += 1) {
      onPage?.(pageNo, totalPages);
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2.35 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      const dataUrl = canvas.toDataURL('image/png');
      const pageOcr = await extractDataUrlTextBest(dataUrl, (progress, phase) => onPage?.(pageNo, totalPages));
      ocrText += `\n--- page ${pageNo} OCR ---\n` + pageOcr.text;
      if (pageOcr.usedEnhanced) warning = [warning, '일부 PDF 페이지는 이미지 보정 후 판독했습니다.'].filter(Boolean).join(' ');
    }
    return { text: ocrText, method: warning.includes('이미지 보정') ? 'PDF 보정 OCR' : 'PDF OCR', warning };
  }

  async function extractImageText(file, onProgress) {
    if (!window.Tesseract) throw new Error('OCR 라이브러리를 불러오지 못했습니다.');
    const dataUrl = await fileToDataUrl(file);
    const result = await extractDataUrlTextBest(dataUrl, onProgress);
    return {
      text: result.text,
      method: result.usedEnhanced ? '이미지 보정 OCR' : '이미지 OCR',
      warning: result.usedEnhanced ? '이미지 보정 후 다시 판독했습니다. 배경 밝기와 대비를 조정해 텍스트 인식을 보완했습니다.' : ''
    };
  }

  async function extractDataUrlText(dataUrl, onProgress, phase = 'original') {
    if (!window.Tesseract) throw new Error('OCR 라이브러리를 불러오지 못했습니다.');
    const result = await window.Tesseract.recognize(dataUrl, 'kor+eng', {
      logger: message => {
        if (message.status === 'recognizing text') onProgress?.(message.progress || 0, phase);
      }
    });
    return result?.data?.text || '';
  }

  async function extractDataUrlTextBest(dataUrl, onProgress) {
    const originalText = await extractDataUrlText(dataUrl, (progress) => onProgress?.(progress * 0.45, 'original'), 'original');
    const originalScore = scoreOcrText(originalText);

    if (originalScore >= 80) {
      return { text: originalText, usedEnhanced: false, originalScore, enhancedScore: 0 };
    }

    let enhancedText = '';
    let enhancedScore = 0;
    try {
      const enhancedDataUrl = await createEnhancedOcrImage(dataUrl);
      enhancedText = await extractDataUrlText(enhancedDataUrl, (progress) => onProgress?.(0.48 + progress * 0.5, 'enhanced'), 'enhanced');
      enhancedScore = scoreOcrText(enhancedText);
    } catch (error) {
      return { text: originalText, usedEnhanced: false, originalScore, enhancedScore: 0 };
    }

    const useEnhanced = enhancedScore > originalScore + 12 || (originalScore < 45 && enhancedScore > originalScore);
    const keywordOriginal = collectKeywords(originalText, [...ENGLISH_CORE_KEYWORDS, ...ENGLISH_CLAUSE_KEYWORDS, ...KEYWORDS.fire, ...KEYWORDS.business, ...KEYWORDS.product, ...KEYWORDS.travel, ...KEYWORDS.policy]).length;
    const keywordEnhanced = collectKeywords(enhancedText, [...ENGLISH_CORE_KEYWORDS, ...ENGLISH_CLAUSE_KEYWORDS, ...KEYWORDS.fire, ...KEYWORDS.business, ...KEYWORDS.product, ...KEYWORDS.travel, ...KEYWORDS.policy]).length;
    const shouldMerge = enhancedText && originalText && Math.abs(enhancedScore - originalScore) <= 18 && keywordEnhanced !== keywordOriginal;
    return {
      text: shouldMerge ? `${originalText}
--- enhanced OCR ---
${enhancedText}` : (useEnhanced ? enhancedText : originalText),
      usedEnhanced: useEnhanced || shouldMerge,
      originalScore,
      enhancedScore
    };
  }

  async function createEnhancedOcrImage(dataUrl) {
    const img = await loadImage(dataUrl);
    const maxSide = 3200;
    const ratio = Math.min(2, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * ratio));
    canvas.height = Math.max(1, Math.round(img.height * ratio));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const samples = [];
    for (let i = 0; i < data.length; i += 16) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const light = (r + g + b) / 3;
      if (light > 145) samples.push([r, g, b, light]);
    }
    samples.sort((a, b) => b[3] - a[3]);
    const top = samples.slice(0, Math.max(30, Math.floor(samples.length * 0.18)));
    const avg = top.reduce((acc, item) => { acc[0] += item[0]; acc[1] += item[1]; acc[2] += item[2]; return acc; }, [0, 0, 0]).map(v => top.length ? v / top.length : 235);
    const scale = avg.map(v => Math.min(1.25, Math.max(0.82, 242 / Math.max(v, 1))));

    const grayValues = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.min(255, data[i] * scale[0]);
      const g = Math.min(255, data[i + 1] * scale[1]);
      const b = Math.min(255, data[i + 2] * scale[2]);
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      grayValues.push(gray);
    }
    const sorted = [...grayValues].sort((a, b) => a - b);
    const low = sorted[Math.floor(sorted.length * 0.04)] || 30;
    const high = sorted[Math.floor(sorted.length * 0.96)] || 245;
    const span = Math.max(35, high - low);

    for (let p = 0, i = 0; i < data.length; i += 4, p += 1) {
      let v = (grayValues[p] - low) * 255 / span;
      v = (v - 128) * 1.12 + 138;
      v = Math.max(0, Math.min(255, v));
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function scoreOcrText(text) {
    const source = String(text || '');
    const compactLength = source.replace(/\s/g, '').length;
    const keywordHits = collectKeywords(source, [
      ...ENGLISH_CORE_KEYWORDS,
      ...ENGLISH_CLAUSE_KEYWORDS,
      ...KEYWORDS.fire,
      ...KEYWORDS.business,
      ...KEYWORDS.product,
      ...KEYWORDS.travel,
      ...KEYWORDS.policy
    ]).length;
    const dateHits = findPeriods(source).length;
    const amountHits = findAmountCandidates(source).length;
    const letterCount = (source.match(/[A-Za-z가-힣0-9]/g) || []).length;
    const symbolCount = (source.match(/[^A-Za-z가-힣0-9\s.,:;()\[\]\/\-₩$]/g) || []).length;
    const garbagePenalty = symbolCount > 0 ? Math.min(35, (symbolCount / Math.max(letterCount, 1)) * 80) : 0;
    return Math.min(160, compactLength / 8 + keywordHits * 18 + dateHits * 8 + amountHits * 8 - garbagePenalty);
  }

  function buildFileResult(file, text, method, warning) {
    const hits = [];
    if (hasAny(text, KEYWORDS.fire)) hits.push('화재보험');
    if (hasAny(text, KEYWORDS.business)) hits.push('영업배상책임보험');
    if (hasAny(text, KEYWORDS.product)) hits.push('생산물배상책임보험');
    if (hasAny(text, KEYWORDS.travel)) hits.push('여행자보험');

    const profile = analyzeEnglishDocument(text);
    const parts = [];
    if (profile.isEnglish) parts.push('영문 서류 감지');
    if (hits.length) parts.push(`${hits.join(' / ')} 관련 문구 확인`);
    if (findPolicyNumbers(text).length) parts.push('증권번호 후보 있음');
    if (findPeriods(text).length) parts.push('보험기간 후보 있음');
    if (findAmountCandidates(text).length) parts.push('보상한도/금액 후보 있음');
    if (profile.isClauseHeavy) parts.push('약관·면책 조항 페이지 추정');
    if (profile.coreScore >= 5) parts.push('핵심 확인 페이지 후보');
    if (/OCR/i.test(method) && profile.isEnglish) parts.push('영문 이미지 OCR 확인 필요');
    if (warning) parts.push(warning);
    if (!text.trim()) parts.push('텍스트를 찾지 못함');

    return {
      fileName: file.name,
      method,
      summary: parts.length ? parts.join(' · ') : '명확한 보험 관련 문구를 찾지 못했습니다.'
    };
  }

  // 한글 서류는 띄어쓰기와 OCR 인식이 흔들리므로, 실제 행정서류 표현을 넓게 잡는다.
  // 파일명은 참고하지 않고, 추출된 본문에서 아래 한글 키워드를 찾는다.
  const KEYWORDS = {
    fire: [
      '화재보험', '화재 보험', '건물화재', '건물 화재', '재산종합보험', '재산 종합 보험',
      '보험목적물', '보험 목적물', '목적물', '건물', '시설', '집기비품',
      'Fire Insurance', 'Property Insurance', 'Package Insurance', 'Property Insured', 'Sum Insured', 'Premises'
    ],
    business: [
      '영업배상책임', '영업 배상 책임', '영업배상책임보험', '영업 배상 책임 보험',
      '시설소유관리자배상', '시설 소유 관리자 배상', '시설소유자배상', '시설 소유자 배상',
      '구내치료비', '구내 치료비', '대인배상', '대물배상',
      '배상책임보험', '배상 책임 보험', '배상책임', '배상 책임',
      'General Liability', 'Public Liability', 'Business Liability', 'Liability Insurance', 'Limit of Liability', 'Any One Occurrence'
    ],
    product: [
      '생산물배상책임', '생산물 배상 책임', '생산물배상책임보험', '생산물 배상 책임 보험',
      '제조물배상책임', '제조물 배상 책임', '제조물책임', '제조물 책임',
      'PL보험', 'PL 보험', '피엘보험', '피엘 보험',
      'Products Liability', 'Product Liability', 'Aggregate Limit'
    ],
    travel: [
      '여행자보험', '여행자 보험', '여행종합보험', '여행 종합 보험', '국내여행보험', '국내 여행 보험',
      '교육여행', '교육 여행', '수학여행', '수련활동', '현장체험학습', '체험학습',
      '여행자보험 가입', '여행자 보험 가입', '교육여행단', '부가조건',
      'Travel Insurance', 'Travelers Insurance', 'Accident Insurance', 'Medical Expenses', 'Coverage Period'
    ],
    policy: [
      '보험증권', '보험 증권', '증권', '증권 사본', '보험계약증권', '보험 계약 증권',
      '보험가입증명', '보험 가입 증명', '가입증명', '가입 증명', '보험가입증명서', '보험 가입증명서',
      'Policy No', 'Policy Number', 'Certificate No', 'Certificate Number', 'Insurance Certificate', 'Policy Schedule'
    ],
    terms: ['보험약관', '보험 약관', '약관', '보통약관', '특별약관', '특약', 'Policy Wording', 'Exclusion Clause', 'Endorsement', 'Clause', 'Conditions'],
    receipt: ['보험료납부', '보험료 납부', '납부영수증', '납부 영수증', '영수증', '보험료', '납입영수증', '납입 영수증'],
    individualFee: [
      '개별 피보험자', '피보험자별', '피보험자 별', '보험료가 일일이', '보험료가 표시',
      '피보험자의 보험료', '피보험자 보험료', '개별 보험료', '일일이 표시'
    ],
    injuryDeath: ['상해 사망', '상해사망', '상해후유장애', '상해 후유장애', '후유장애', '후유 장애', '사망후유장애', '사망 후유장애'],
    injuryMedical: ['상해 치료', '상해치료', '상해치료실비', '상해 치료실비', '치료실비', '치료 실비', '상해의료', '상해 의료', '의료실비'],
    diseaseDeath: ['질병 사망', '질병사망', '질병후유장애', '질병 후유장애', '질병 사망후유장애', '질병 사망 후유장애'],
    diseaseMedical: ['질병 치료', '질병치료', '질병치료실비', '질병 치료실비', '질병의료', '질병 의료'],
    liability: ['배상책임', '배상 책임', '손해배상', '손해 배상', '배상한도', '보상한도', '보상 한도'],
    belongings: ['휴대품', '휴대 물품', '휴대물품', '휴대품손해', '휴대품 손해', '휴대품손상', '휴대품 손상'],
    period: [
      '보험기간', '보험 기간', '유효기간', '유효 기간', '계약기간', '계약 기간',
      '보험개시', '보험 개시', '보험종기', '보험 종기', '시기', '종기', '만기',
      'Period of Insurance', 'Policy Period', 'Insurance Period', 'Effective Date', 'Expiry Date', 'Expiration Date', 'Inception Date', 'Coverage Period'
    ],
    amount: [
      '사고당', '사고 당', '1사고당', '1 사고당', '일사고당', '일 사고당',
      '보험금액', '보험 금액', '가입금액', '가입 금액', '보상한도', '보상 한도', '배상한도', '배상 한도', '보장한도', '보장 한도',
      'Limit of Liability', 'Liability Limit', 'Coverage Limit', 'Sum Insured', 'Amount Insured', 'Indemnity Limit', 'Any One Accident', 'Aggregate Limit'
    ],
    vendor: ['피보험자', '계약자', '보험계약자', '상호', '업체명', '대표자', '상호명', '법인명', '사업자명', 'Insured', 'Named Insured', 'Policyholder', 'Assured', 'Applicant', 'The Insured', 'Name of Insured'],
    address: ['주소', '소재지', '사업장', '사업장소재지', '사업장 소재지', '보험목적물', '보험 목적물', '소재장소', 'Address', 'Location', 'Premises', 'Risk Location', 'Insured Location', 'Situation', 'Property Insured Location']
  };

  const ENGLISH_CORE_KEYWORDS = [
    'Policy No', 'Policy Number', 'Certificate No', 'Certificate Number', 'Named Insured', 'Insured',
    'Policyholder', 'Period of Insurance', 'Policy Period', 'Insurance Period', 'Effective Date',
    'Expiry Date', 'Expiration Date', 'Limit of Liability', 'Liability Limit', 'Sum Insured',
    'Amount Insured', 'Risk Location', 'Insured Location', 'Premises', 'Insurance Company',
    'Insurer', 'Underwriter'
  ];

  const ENGLISH_CLAUSE_KEYWORDS = [
    'Exclusion', 'Exclusion Clause', 'Clause', 'Endorsement', 'Policy Wording', 'Sanction',
    'Pollution', 'Contamination', 'Terrorism', 'Sabotage', 'Pandemic', 'Infectious Disease',
    'Communicable Disease', 'War', 'Nuclear', 'Limitation', 'Conditions'
  ];


  const ENGLISH_ITEM_GUIDES = {
    '화재보험': {
      foundStatus: '영문 후보 확인',
      found: '영문 문서에서 화재보험/재산보험 관련 표현이 확인되었습니다. 보험기간, 소재지, 가입금액(Sum Insured)을 함께 확인하세요.',
      missing: '화재보험 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Fire Insurance, Property Insurance, Sum Insured 문구가 있는지 확인하세요.'
    },
    '영업배상책임보험': {
      foundStatus: '영문 후보 확인',
      found: '영문 문서에서 배상책임보험 관련 표현이 확인되었습니다. Limit of Liability, Any One Occurrence 등 보상한도 문구를 함께 확인하세요.',
      missing: '영업배상책임보험 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. General Liability, Public Liability, Limit of Liability 문구가 있는지 확인하세요.'
    },
    '영업배상책임보험 증권 사본': {
      foundStatus: '영문 후보 확인',
      found: '영문 문서에서 보험증권/가입증명 관련 표현이 확인되었습니다. Policy No., Certificate No., Policy Schedule 문구를 기준으로 증권 사본 여부를 확인하세요.',
      missing: '보험증권 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Policy No., Certificate No., Policy Schedule 문구가 있는지 확인하세요.'
    },
    '사고당 보험금액 문구': {
      foundStatus: '영문 후보 확인',
      found: '영문 문서에서 보상한도 관련 표현이 확인되었습니다. Limit of Liability, Any One Occurrence, Aggregate Limit 문구와 금액을 함께 확인하세요.',
      missing: '사고당 보험금액 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Limit of Liability, Any One Occurrence 문구가 있는지 확인하세요.'
    },
    '생산물배상책임보험': {
      foundStatus: '영문 후보 확인',
      found: '영문 문서에서 생산물배상책임보험 관련 표현이 확인되었습니다. Products Liability 및 Aggregate Limit 문구를 함께 확인하세요.',
      missing: '생산물배상책임보험 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Products Liability, Product Liability 문구가 있는지 확인하세요.'
    },
    '여행자보험': {
      foundStatus: '영문 후보 확인',
      found: '영문 문서에서 여행자보험 관련 표현이 확인되었습니다. Coverage Period, Accident, Medical Expenses 문구를 함께 확인하세요.',
      missing: '여행자보험 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Travel Insurance, Coverage Period 문구가 있는지 확인하세요.'
    },
    '여행자보험 증권': {
      foundStatus: '영문 후보 확인',
      found: '영문 문서에서 여행자보험 증권 관련 표현이 확인되었습니다. Policy No., Certificate No., Insurance Certificate 문구를 확인하세요.',
      missing: '여행자보험 증권 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Policy No., Certificate No., Insurance Certificate 문구가 있는지 확인하세요.'
    },
    '보험 약관': {
      foundStatus: '약관 페이지 추정',
      found: 'Exclusion, Clause, Endorsement 등 약관·면책 조항 표현이 확인되었습니다. 이 페이지는 주요 가입정보보다 약관 확인용에 가깝습니다.',
      missing: '보험 약관 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Policy Wording, Conditions, Exclusion Clause 문구가 있는지 확인하세요.'
    },
    '보험료 납부 영수증': {
      foundStatus: '영문 후보 확인',
      found: '보험료 또는 납부 관련 표현이 확인되었습니다. Premium, Receipt, Paid 문구와 금액을 함께 확인하세요.',
      missing: '보험료 납부 영수증 관련 표현은 뚜렷하게 확인되지 않았습니다. Premium, Receipt, Paid 문구가 있는지 확인하세요.'
    },
    '개별 피보험자 보험료 표시': {
      foundStatus: '확인 필요',
      found: '피보험자별 보험료 관련 표현 후보가 확인되었습니다. 각 피보험자별 보험료가 분리 표시되어 있는지 원본에서 확인하세요.',
      missing: '개별 피보험자별 보험료 표시 문구는 뚜렷하게 확인되지 않았습니다. 피보험자 목록과 보험료 산출 내역을 원본에서 확인하세요.'
    },
    '상해 사망·후유장애 항목': {
      foundStatus: '영문 후보 확인',
      found: '상해 사망·후유장애에 해당할 수 있는 Accident, Death, Disability 관련 표현이 확인되었습니다. 보장금액을 함께 확인하세요.',
      missing: '상해 사망·후유장애 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Accident, Death, Disability 문구가 있는지 확인하세요.'
    },
    '상해 치료실비 항목': {
      foundStatus: '영문 후보 확인',
      found: '상해 치료실비에 해당할 수 있는 Medical Expenses 관련 표현이 확인되었습니다. 보장금액과 보장범위를 함께 확인하세요.',
      missing: '상해 치료실비 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Medical Expenses, Injury Medical 문구가 있는지 확인하세요.'
    },
    '질병 사망·후유장애 항목': {
      foundStatus: '확인 필요',
      found: '질병 사망·후유장애 관련 표현 후보가 확인되었습니다. 질병 관련 담보와 보장금액을 원본에서 확인하세요.',
      missing: '질병 사망·후유장애 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Disease, Sickness, Death, Disability 문구가 있는지 확인하세요.'
    },
    '질병 치료실비 항목': {
      foundStatus: '확인 필요',
      found: '질병 치료실비 관련 표현 후보가 확인되었습니다. 질병 의료비 담보와 보장금액을 원본에서 확인하세요.',
      missing: '질병 치료실비 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Disease, Sickness, Medical Expenses 문구가 있는지 확인하세요.'
    },
    '배상책임 항목': {
      foundStatus: '영문 후보 확인',
      found: '배상책임 관련 표현이 확인되었습니다. Liability, Limit of Liability, Any One Occurrence 문구와 금액을 함께 확인하세요.',
      missing: '배상책임 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Liability, Limit of Liability 문구가 있는지 확인하세요.'
    },
    '휴대품 항목': {
      foundStatus: '확인 필요',
      found: '휴대품 담보 관련 표현 후보가 확인되었습니다. Baggage, Personal Effects, Belongings 문구와 보장금액을 확인하세요.',
      missing: '휴대품 담보 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. Baggage, Personal Effects 문구가 있는지 확인하세요.'
    }
  };

  const INSURANCE_DEFINITIONS = {
    fire: {
      label: '건물 화재보험',
      related: [
        '화재보험', '화재 보험', '건물화재', '건물 화재', '재물보험', '재물 보험', '재산보험', '재산 보험',
        '재물종합위험보장', '재물 종합 위험 보장', '재물손해', '재물 손해', '재산종합보험', '재산 종합 보험',
        '건물', '건물 및 부속설비', '부속설비', '보험목적물', '보험 목적물', '목적물', '소재지', '가입금액', '보험가입금액', '보험금액', '질권사항',
        'Fire Insurance', 'Property Insurance', 'Package Insurance', 'Package Insurance Policy', 'Property Damage', 'Property Insured',
        'Sum Insured', 'Amount Insured', 'Building', 'Premises', 'Risk Location', 'Location'
      ],
      strong: [
        '재물종합위험보장', '건물 및 부속설비', '화재보험', '건물 화재', '재물보험', '재산보험',
        'Fire Insurance', 'Property Insurance', 'Package Insurance Policy', 'Package Insurance', 'Property Insured', 'Section I - Property All Risks Cover', 'Property All Risks Cover'
      ],
      negativeScope: ['재물종합위험보장', '건물 및 부속설비', 'Section I - Property All Risks Cover', 'Property All Risks Cover', 'Fire Insurance', 'Property Insurance', 'Sum Insured', '건물'],
      foundMessage: '건물 화재보험 또는 재물보험 관련 표현이 확인되었습니다. 보험기간, 소재지, 가입금액을 함께 확인하세요.',
      missingMessage: '건물 화재보험 관련 표현은 뚜렷하게 확인되지 않았습니다. 화재보험, 재물종합위험보장, Property Insurance, Sum Insured 문구가 있는지 확인하세요.',
      checks: [
        { label: '보험종목', keywords: ['화재보험', '재물종합위험보장', '재물보험', 'Fire Insurance', 'Property Insurance', 'Package Insurance'] },
        { label: '보험기간', keywords: ['보험기간', 'Period of Insurance', 'Policy Period', 'Insurance Period', 'From', 'To'] },
        { label: '피보험자/계약자', keywords: ['피보험자', '계약자', 'Insured', 'Named Insured', 'Policyholder'] },
        { label: '주소/소재지', keywords: ['소재지', '주소', 'Premises', 'Risk Location', 'Address', 'Location'] },
        { label: '가입금액/보상한도', keywords: ['가입금액', '보험가입금액', '보험금액', '보상한도', 'Sum Insured', 'Amount Insured'] },
        { label: '보험회사/증권번호', keywords: ['보험회사', '현대해상', '증권번호', 'Insurer', 'Insurance Company', 'Policy No', 'Certificate No'] }
      ]
    },
    business: {
      label: '영업배상책임보험',
      related: [
        '영업배상책임', '영업 배상 책임', '영업배상책임보험', '영업 배상 책임 보험', '배상책임보험', '배상 책임 보험',
        '배상책임위험보장', '배상 책임 위험 보장', '시설소유관리자', '시설소유관리자 배상책임', '시설소유자배상',
        '사고당', '1사고당', '총보상한도', '보상한도', '배상한도', '자기부담금', '대인', '대물', '법률상 배상책임',
        'General Liability', 'Public Liability', 'Business Liability', 'Commercial General Liability', 'Premises Liability', 'Liability Insurance',
        'Premises & Operation Liability', 'Premises and Operation Liability', 'Premises & Operations', 'Operation Liability Coverage',
        'Combined Single Limit', 'Limit of Liability', 'Liability Limit', 'Any One Occurrence', 'Any One Accident'
      ],
      strong: [
        '배상책임위험보장', '시설소유관리자 배상책임', '영업배상책임보험', '영업배상책임',
        'Premises & Operation Liability', 'Premises and Operation Liability', 'Operation Liability Coverage', 'Combined Single Limit',
        'General Liability', 'Public Liability', 'Limit of Liability', 'Section IV - General Liability', 'Section IV - Liability', '배상책임 위험 보장'
      ],
      negativeScope: ['배상책임위험보장', '시설소유관리자 배상책임', '영업배상책임보험', 'General Liability', 'Public Liability', 'Premises and Operation Liability', 'Combined Single Limit', 'Section IV - General Liability'],
      foundMessage: '영업배상책임보험 관련 표현이 확인되었습니다. 사고당 보상한도와 총보상한도를 함께 확인하세요.',
      missingMessage: '영업배상책임보험 관련 표현은 뚜렷하게 확인되지 않았습니다. 배상책임위험보장, Premises & Operation Liability, Limit of Liability 문구가 있는지 확인하세요.',
      checks: [
        { label: '보험종목', keywords: ['배상책임위험보장', '영업배상책임보험', 'General Liability', 'Public Liability', 'Premises & Operation Liability'] },
        { label: '보험기간', keywords: ['보험기간', 'Period of Insurance', 'Policy Period'] },
        { label: '피보험자/계약자', keywords: ['피보험자', '계약자', 'Insured', 'Named Insured', 'Policyholder'] },
        { label: '적용 사업장/장소', keywords: ['사업장', '소재지', 'Premises', 'Location', 'Address'] },
        { label: '사고당 보상한도', keywords: ['사고당', '1사고당', 'Any One Occurrence', 'Any One Accident'] },
        { label: '보상한도', keywords: ['보상한도', '배상한도', '총보상한도', 'Limit of Liability', 'Liability Limit', 'Combined Single Limit'] },
        { label: '보험회사/증권번호', keywords: ['보험회사', '현대해상', '증권번호', 'Insurer', 'Insurance Company', 'Policy No', 'Certificate No'] }
      ]
    },
    product: {
      label: '생산물배상책임보험',
      related: [
        '생산물배상책임', '생산물 배상 책임', '생산물배상책임보험', '생산물 배상 책임 보험', '생산물배상',
        '생산물', '완성작업위험', '생산물/완성작업위험', '제조물', '제조물책임', '제조물배상책임', 'PL보험',
        'Products Liability', 'Product Liability', 'Product Liability Insurance', 'Products/Completed Operations', 'Products and Completed Operations',
        'Completed Operations', 'Aggregate Limit', 'Limit of Liability', 'Any One Occurrence', 'Any One Accident'
      ],
      strong: [
        '생산물배상책임', '생산물배상책임보험', '생산물/완성작업위험', '제조물책임',
        'Products Liability', 'Product Liability', 'Products/Completed Operations', 'Completed Operations', 'P/L for Exports', 'Product/Completed Operations'
      ],
      negativeScope: ['생산물배상책임', '생산물배상책임보험', '생산물/완성작업위험', 'Products Liability', 'Product Liability', 'Products/Completed Operations', 'Completed Operations', 'P/L for Exports', 'Product/Completed Operations'],
      foundMessage: '생산물배상책임보험 관련 표현이 확인되었습니다. Products Liability, Aggregate Limit, Limit of Liability 문구를 함께 확인하세요.',
      missingMessage: '생산물배상책임보험 관련 표현은 뚜렷하게 확인되지 않았습니다. 생산물배상책임, Products Liability, Products/Completed Operations 문구가 있는지 확인하세요.',
      checks: [
        { label: '보험종목', keywords: ['생산물배상책임보험', '생산물배상책임', 'Products Liability', 'Product Liability', 'Products/Completed Operations'] },
        { label: '보험기간', keywords: ['보험기간', 'Period of Insurance', 'Policy Period'] },
        { label: '피보험자/계약자', keywords: ['피보험자', '계약자', 'Insured', 'Named Insured', 'Policyholder'] },
        { label: '사고당 보상한도', keywords: ['사고당', '1사고당', 'Any One Occurrence', 'Any One Accident'] },
        { label: '총보상한도', keywords: ['총보상한도', 'Aggregate Limit'] },
        { label: '보상한도', keywords: ['보상한도', '배상한도', 'Limit of Liability', 'Liability Limit'] },
        { label: '보장 적용 여부', keywords: ['적용', '미적용', 'Not Covered', 'Covered', 'Applied', 'Excluded'] },
        { label: '보험회사/증권번호', keywords: ['보험회사', '현대해상', '증권번호', 'Insurer', 'Insurance Company', 'Policy No', 'Certificate No'] }
      ]
    },
    travel: {
      label: '여행자보험',
      related: [
        '여행자보험', '여행자 보험', '여행보험', '국내여행보험', '해외여행보험', '여행기간', '피보험자명단', '여행자',
        '상해사망', '후유장해', '의료비', '실손의료비', '수학여행', '수련활동', '현장체험학습',
        'Travel Insurance', 'Travelers Insurance', 'Traveller Insurance', 'Travel Accident', 'Accident', 'Medical Expenses',
        'Coverage Period', 'Travel Period', 'Insured Person', 'Traveler', 'Destination', 'Death', 'Disability'
      ],
      strong: ['여행자보험', '국내여행보험', '해외여행보험', 'Travel Insurance', 'Travelers Insurance', 'Traveller Insurance'],
      foundMessage: '여행자보험 관련 표현이 확인되었습니다. 여행기간, 대상자, 보장내용과 보상한도를 함께 확인하세요.',
      missingMessage: '여행자보험 관련 표현은 뚜렷하게 확인되지 않았습니다. 여행자보험, Travel Insurance, Coverage Period 문구가 있는지 확인하세요.',
      checks: [
        { label: '보험종목', keywords: ['여행자보험', '국내여행보험', 'Travel Insurance', 'Travelers Insurance'] },
        { label: '보험기간/여행기간', keywords: ['여행기간', '보험기간', 'Coverage Period', 'Period of Insurance', 'Travel Period'] },
        { label: '피보험자/대상자', keywords: ['피보험자', '피보험자명단', '여행자', 'Insured Person', 'Traveler', 'Name of Insured'] },
        { label: '보장내용', keywords: ['상해사망', '후유장해', '의료비', 'Accident', 'Medical Expenses', 'Death', 'Disability'] },
        { label: '보상한도', keywords: ['보상한도', '보험금액', 'Coverage Limit', 'Sum Insured'] },
        { label: '여행지/일정', keywords: ['여행지', '일정', 'Destination', 'Travel Period'] },
        { label: '보험회사/증권번호', keywords: ['보험회사', '증권번호', 'Insurer', 'Insurance Company', 'Policy No', 'Certificate No'] }
      ]
    }
  };

  const COVERED_KEYWORDS = [
    '적용', '보장', '가입', '가입금액', '보상한도', '총보상한도', '1사고당', '한도',
    'Covered', 'Applied', 'Included', 'Limit', 'Sum Insured', 'Amount Insured', 'Combined Single Limit'
  ];

  const NOT_COVERED_KEYWORDS = [
    '미적용', '미 적용', '제외', '보장하지 않음', '담보하지 않음', '해당 없음', '미가입',
    'Not Covered', 'NotCovered', 'Not Applied', 'Excluded', 'Nil', 'N/A'
  ];

  const PAGE_ROLE_KEYWORDS = {
    summary: ['총괄명세서', '보험기간', '증권번호', '계약자명', '피보험자명', '업종', '소재지', '보험료', '섹션', 'Section', 'Policy Schedule', 'Certificate', 'Policy No', 'Period of Insurance'],
    coverage: ['섹션 I', '섹션 IV', '섹션Ⅰ', '섹션Ⅳ', '재물종합위험보장', '배상책임위험보장', '보험가입금액', '보상한도액', '자기부담금', 'Section I', 'Section IV', 'Property All Risks Cover', 'General Liability', 'Coverage', 'Limit', 'Sum Insured'],
    clause: ['보험조건', '특별조항', '면책', '제외', '조항', 'Conditions', 'Exclusion', 'Clause', 'Endorsement', 'Policy Wording', 'Limitation']
  };

  const COMMON_CHECK_DEFINITIONS = [
    { key: 'period', label: '보험기간', keywords: ['Period of Insurance', 'Policy Period', 'Insurance Period', 'Effective Date', 'Expiry Date', 'Expiration Date', 'Inception Date', 'Coverage Period', '보험기간', '유효기간'] },
    { key: 'vendor', label: '피보험자/계약자', keywords: ['Insured', 'Named Insured', 'Policyholder', 'Assured', 'Applicant', 'Name of Insured', '피보험자', '계약자', '보험계약자'] },
    { key: 'address', label: '주소/소재지', keywords: ['Address', 'Location', 'Premises', 'Risk Location', 'Insured Location', 'Situation', '주소', '소재지', '사업장'] },
    { key: 'amount', label: '보상한도/가입금액', keywords: ['Limit of Liability', 'Liability Limit', 'Coverage Limit', 'Sum Insured', 'Amount Insured', 'Indemnity Limit', 'Any One Occurrence', 'Aggregate Limit', '보상한도', '가입금액', '보험금액'] },
    { key: 'policyNo', label: '보험회사/증권번호', keywords: ['Insurer', 'Insurance Company', 'Underwriter', 'Policy No', 'Policy Number', 'Certificate No', 'Certificate Number', '보험회사', '증권번호'] }
  ];

  function buildFallbackStructuredResult(message) {
    const selectedTypes = selectedValues('type');
    return {
      readingSummary: [
        { label: 'OCR 상태', value: '분석 어려움', tone: 'danger' },
        { label: '문서 언어', value: '확인 불가', tone: 'gray' },
        { label: '문서 성격', value: '결과 정리 오류', tone: 'danger' },
        { label: '확인 방식', value: `오류 내용: ${message}`, tone: 'gray' }
      ],
      insuranceSummaries: selectedTypes.map(key => ({
        key,
        label: INSURANCE_DEFINITIONS[key]?.label || key,
        status: '분석 어려움',
        evidence: [],
        detail: '결과 정리 중 오류가 발생했습니다. 입력 초기화 후 다시 분석해 주세요.'
      })),
      insuranceCards: [],
      commonChecks: [],
      cautions: [{
        title: '분석 오류',
        status: '분석 어려움',
        hits: [],
        detail: `결과 정리 중 오류가 발생했습니다. ${message}`
      }],
      pageCandidates: [],
      textProfile: { status: '분석 어려움', tone: 'danger' },
      language: '확인 불가',
      nature: '결과 정리 오류'
    };
  }

  function buildChecklist(extractions) {
    const allText = extractions.map(item => item.text).join('\n');
    const selectedTypes = selectedValues('type');
    const selectedCommon = selectedValues('common');
    const textProfile = analyzeTextQuality(extractions, allText);
    const englishProfile = analyzeEnglishDocument(allText);
    const pageCandidates = findEnglishPageCandidates(extractions);
    const ocrDiagnostics = buildOcrDiagnostics(extractions);
    const clauseHits = collectKeywords(allText, ENGLISH_CLAUSE_KEYWORDS);

    const structuredResult = buildStructuredResult(extractions, allText, selectedTypes, selectedCommon, textProfile, englishProfile, pageCandidates, clauseHits, ocrDiagnostics);
    const rows = flattenStructuredRows(structuredResult);

    const pointGroups = {
      '감지된 보험 종류': structuredResult.insuranceSummaries.map(item => `${item.label}: ${item.status}${item.evidence.length ? ` (${item.evidence.join(', ')})` : ''}`),
      '공통 확인 항목': structuredResult.commonChecks.map(item => `${item.label}: ${item.status}${item.hits.length ? ` (${item.hits.join(', ')})` : ''}`),
      '참고/주의 페이지': structuredResult.cautions.map(item => `${item.title}: ${item.hits.join(', ')}`),
      '영문 핵심정보 후보': collectKeywords(allText, ENGLISH_CORE_KEYWORDS),
      '영문 약관·면책 조항 후보': clauseHits,
      '증권번호 후보': findPolicyNumbers(allText),
      '기간 후보': findPeriods(allText),
      '금액/보상한도 후보': findAmountCandidates(allText),
      '업체명 후보': findVendorCandidates(allText),
      '주소 후보': findAddressCandidates(allText),
      '확인 페이지 후보': pageCandidates,
      '페이지별 판독 상태': ocrDiagnostics.pages.map(page => `${page.fileName} ${page.pageNo}쪽: ${page.status} · ${page.role}${page.keywords.length ? ` (${page.keywords.slice(0, 4).join(', ')})` : ''}`)
    };

    return { rows, pointGroups, structuredResult };
  }

  function buildStructuredResult(extractions, allText, selectedTypes, selectedCommon, textProfile, englishProfile, pageCandidates, clauseHits, ocrDiagnostics) {
    const language = detectLanguageLabel(allText);
    let nature = detectDocumentNature(englishProfile, clauseHits, pageCandidates, allText);
    const hasPolicyStructure = ocrDiagnostics?.hasPolicyStructure;
    const hasWeakCorePages = ocrDiagnostics?.hasWeakCorePages;
    if (hasPolicyStructure && hasWeakCorePages) nature = '보험증권 구조 감지 · 일부 핵심 페이지 OCR 확인 필요';
    const readingSummary = [
      { label: 'OCR 상태', value: textProfile.status, tone: textProfile.tone },
      { label: '문서 언어', value: language, tone: language.includes('영문') ? 'blue' : 'gray' },
      { label: '문서 성격', value: nature, tone: englishProfile.isClauseHeavy ? 'clause' : 'gray' },
      { label: '확인 방식', value: language.includes('혼합') ? '국문+영문 키워드 기준으로 보험종류와 보장 적용 여부를 함께 검토' : language.includes('영문') ? '영문 키워드 기준으로 보험종류와 확인 항목을 분리해 검토' : '국문 문구 기준으로 보험종류와 확인 항목을 분리해 검토', tone: 'gray' }
    ];

    const insuranceSummaries = selectedTypes.map(key => evaluateInsuranceType(key, allText, textProfile, englishProfile));
    const insuranceCards = insuranceSummaries.map(summary => buildInsuranceCard(summary, allText, textProfile));
    const commonChecks = buildCommonChecks(allText, selectedCommon, textProfile, englishProfile);
    const cautions = buildCautions(clauseHits, pageCandidates, textProfile, englishProfile, extractions);

    return { readingSummary, insuranceSummaries, insuranceCards, commonChecks, cautions, pageCandidates, ocrDiagnostics, textProfile, language, nature };
  }



  function normalizeTextForSearch(text) {
    return normalizeText(text || '')
      .replace(/ /g, ' ')
      .replace(/[｜|]/g, ' ')
      .replace(/[：:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hasFirePropertyPackageContext(text) {
    const normalized = normalizeTextForSearch(text || '');
    const packageHits = collectKeywords(normalized, [
      'Package Insurance Policy', 'Package Insurance Policy II', 'Package Insurance', '보험증권', '총괄명세서',
      'Master Schedule', 'Policy Schedule'
    ]);
    const propertySectionHits = collectKeywords(normalized, [
      '재물종합위험보장', '재물 종합 위험 보장', '재물손해', '재물 손해', '보험가입금액', '가입금액', '소재지',
      '건물 및 부속설비', '건물및부속설비', '건물', '부속설비', '섹션 I', '섹션Ⅰ',
      'Section I - Property All Risks Cover', 'Property All Risks Cover', 'Property All Risks', 'Property Insured',
      'Sum Insured', 'Amount Insured', 'Building', 'Facility', 'Fire & Marine Insurance', 'Marine & Fire Insurance'
    ]);
    const policyLikeHits = collectKeywords(normalized, [
      'Hyundai Marine & Fire Insurance', 'Marine & Fire Insurance', '현대해상', 'Hicar', 'HiLife',
      '보험기간', 'Policy Period', 'Period of Insurance', '증권번호', 'Policy No', '계약자명', '피보험자명'
    ]);
    const sectionContext = hasCombo(normalized, ['섹션 I', '재물종합위험보장']) ||
      hasCombo(normalized, ['Section I', 'Property All Risks']) ||
      hasCombo(normalized, ['재물종합위험보장', '가입금액']) ||
      hasCombo(normalized, ['재물종합위험보장', '소재지']) ||
      hasCombo(normalized, ['재물종합위험보장', '건물']) ||
      hasCombo(normalized, ['Property All Risks Cover', 'Building']) ||
      hasCombo(normalized, ['Property All Risks Cover', 'Sum Insured']);

    const hasPropertyRoot = collectKeywords(normalized, [
      '재물종합위험보장', 'Property All Risks Cover', 'Property All Risks', 'Property Insured'
    ]).length > 0;

    // 현대해상 패키지보험은 OCR이 약하면 'Package Insurance Policy'와 보험기간/총괄명세서 정도만 잡히는 경우가 있음.
    // 이 경우 Fire Insurance 단어가 없더라도 건물 화재보험/재물보험 후보로 올린다.
    const weakButMeaningfulPackage = packageHits.length && (policyLikeHits.length || normalized.length > 180);

    return {
      matched: sectionContext || hasPropertyRoot || propertySectionHits.length >= 2 || weakButMeaningfulPackage,
      evidence: [...new Set([...packageHits, ...propertySectionHits, ...policyLikeHits])].slice(0, 10),
      isStrong: sectionContext || hasPropertyRoot || propertySectionHits.length >= 3
    };
  }

  function containsKeyword(text, keyword) {
    const compactText = normalizeText(text || '').replace(/\s+/g, '').toLowerCase();
    const compactKeyword = normalizeText(keyword || '').replace(/\s+/g, '').toLowerCase();
    return !!compactKeyword && compactText.includes(compactKeyword);
  }

  function hasCombo(text, keywords) {
    return keywords.every(keyword => containsKeyword(text, keyword));
  }

  function evaluateInsuranceType(key, text, textProfile, englishProfile) {
    const def = INSURANCE_DEFINITIONS[key];
    const normalized = normalizeTextForSearch(text || '');
    const policyStructureHits = collectKeywords(normalized, [
      'Package Insurance Policy', 'Package Insurance Policy II', 'Package Insurance', '보험증권', '총괄명세서', 'Master Schedule', 'Policy Schedule',
      '보험기간', 'Policy Period', 'Period of Insurance', '증권번호', 'Policy No', '현대해상', 'Hyundai Marine & Fire Insurance'
    ]);
    const fireStructureHints = collectKeywords(normalized, [
      '섹션 I', '섹션Ⅰ', 'Section I', '재물종합위험보장', '재물 종합 위험 보장', 'Property All Risks', 'Property All Risks Cover',
      '건물 및 부속설비', '보험가입금액', '가입금액', '소재지', 'Building', 'Sum Insured', 'Risk Location', 'Premises'
    ]);
    const businessStructureHints = collectKeywords(normalized, [
      '섹션 IV', '섹션Ⅳ', 'Section IV', '배상책임위험보장', '배상책임', 'Liability Coverage', 'Premises & Operation Liability',
      'Premises and Operation Liability', 'Combined Single Limit', 'Bodily Injury', 'Property Damage'
    ]);
    const policyStructureDetected = policyStructureHits.length >= 2 || (policyStructureHits.length >= 1 && normalized.length > 180);

    let evidence = collectKeywords(text, def.related).slice(0, 10);
    let strongHits = collectKeywords(text, def.strong).slice(0, 8);
    let firePackageContext = null;
    if (key === 'fire') {
      firePackageContext = hasFirePropertyPackageContext(text);
      const structuralFireCandidate = policyStructureDetected && (fireStructureHints.length || textProfile.status !== '텍스트 인식됨');
      if (firePackageContext.matched || structuralFireCandidate) {
        const fallbackEvidence = firePackageContext.evidence.length
          ? firePackageContext.evidence
          : [...new Set([...policyStructureHits, ...fireStructureHints, '보험증권 구조 감지'])];
        evidence = [...new Set([...evidence, ...fallbackEvidence])].slice(0, 10);
        strongHits = [...new Set([...strongHits, ...fireStructureHints, ...fallbackEvidence.slice(0, 4)])].slice(0, 8);
        if (!firePackageContext.matched) {
          firePackageContext = {
            matched: true,
            evidence: fallbackEvidence,
            isStrong: fireStructureHints.length >= 2 || policyStructureHits.length >= 3
          };
        }
      }
    }

    // 배상책임/생산물은 단어 하나가 약하게 잡혀도 Package 보험증권 구조 안에서는 후보로 다루되,
    // Not Covered/미적용은 반드시 가까운 문맥에 있을 때만 반영한다.
    if (key === 'business') {
      const businessContext = collectKeywords(normalized, [
        '배상책임위험보장', '배상책임', '시설소유관리자', '섹션 IV', '섹션Ⅳ', 'Section IV',
        'Liability Coverage', 'Premises & Operation Liability Coverage', 'Premises and Operation Liability Coverage',
        'Combined Single Limit', 'Bodily Injury', 'Property Damage', 'Medical Payment Coverage'
      ]);
      if (businessContext.length || (policyStructureDetected && businessStructureHints.length)) {
        const fallbackBusiness = businessContext.length ? businessContext : [...new Set([...businessStructureHints, ...policyStructureHits.slice(0, 3), '배상책임 섹션 구조 감지'])];
        evidence = [...new Set([...evidence, ...fallbackBusiness])].slice(0, 10);
        strongHits = [...new Set([...strongHits, ...fallbackBusiness])].slice(0, 8);
      }
    }
    if (key === 'product') {
      const productContext = collectKeywords(normalized, [
        '생산물배상책임', '생산물/완성작업위험', '완성작업위험', 'Products/Completed Operations',
        'Products Liability', 'Product Liability', 'Completed Operations', 'P/L for Exports'
      ]);
      if (productContext.length) {
        evidence = [...new Set([...evidence, ...productContext])].slice(0, 10);
        strongHits = [...new Set([...strongHits, ...productContext])].slice(0, 8);
      }
    }

    const commonHitCount = COMMON_CHECK_DEFINITIONS.reduce((sum, check) => sum + (collectKeywords(text, check.keywords).length ? 1 : 0), 0);
    const notCoveredHits = findContextualStatusHits(text, def.negativeScope || def.strong, NOT_COVERED_KEYWORDS);
    const coveredHits = findContextualStatusHits(text, def.negativeScope || def.strong, COVERED_KEYWORDS);

    let status = '관련 문구 없음';
    const fireStructuralCandidate = key === 'fire' && firePackageContext && firePackageContext.matched;
    const businessStructuralCandidate = key === 'business' && evidence.length && (businessStructureHints.length || strongHits.length);
    if (textProfile.status === '판독 어려움') status = policyStructureDetected ? '핵심 페이지 확인 필요' : '판독 어려움';
    else if (notCoveredHits.length && !(key === 'fire' && fireStructuralCandidate) && !(key === 'business' && businessStructuralCandidate)) status = '미적용 가능성';
    else if ((strongHits.length && commonHitCount >= 2) || (key === 'fire' && firePackageContext && firePackageContext.isStrong && commonHitCount >= 1)) status = '확인됨';
    else if (fireStructuralCandidate || businessStructuralCandidate || strongHits.length || evidence.length >= 2) status = '확인 후보';
    else if (textProfile.status === '일부 인식됨' && policyStructureDetected) status = '핵심 페이지 확인 필요';
    else if (evidence.length === 1) status = '확인 필요';
    else if (policyStructureDetected) status = '확인 필요';
    else if (textProfile.status === '일부 인식됨') status = '확인 필요';
    else status = '관련 문구 없음';

    let detail = evidence.length ? def.foundMessage : def.missingMessage;
    if (key === 'fire' && firePackageContext && firePackageContext.matched) {
      detail = firePackageContext.isStrong
        ? '재물종합위험보장 또는 Property All Risks Cover 관련 표현이 확인되었습니다. 건물 화재보험 또는 재물보험 관련 서류로 보이며, 보험기간, 소재지, 가입금액을 함께 확인하세요.'
        : '보험증권 구조와 재물보장 섹션 가능성이 확인되었습니다. 원본에서 섹션 I - 재물종합위험보장, 건물 및 부속설비, 보험가입금액, 소재지를 확인하세요.';
    }
    if (key === 'business' && businessStructuralCandidate) {
      detail = strongHits.length
        ? '배상책임위험보장 또는 Liability Coverage 관련 표현이 확인되었습니다. 사고당 보상한도, 총보상한도, 자기부담금을 함께 확인하세요.'
        : '보험증권 구조와 배상책임 섹션 가능성이 확인되었습니다. 원본에서 섹션 IV - 배상책임위험보장 또는 Premises & Operation Liability Coverage를 확인하세요.';
    }
    if (!evidence.length && (textProfile.status === '일부 인식됨' || policyStructureDetected)) {
      detail = policyStructureDetected
        ? `보험증권 구조는 확인되나 ${def.label} 핵심 문구는 OCR에서 충분히 잡히지 않았습니다. 원본의 총괄명세서 또는 보장 상세 페이지에서 ${def.strong.slice(0, 3).join(', ')} 문구를 확인하세요.`
        : `OCR이 일부만 인식되어 ${def.label} 관련 핵심 문구를 충분히 확인하지 못했습니다. 원본에서 ${def.strong.slice(0, 3).join(', ')} 문구가 있는지 확인하세요.`;
    }
    if (status === '미적용 가능성') {
      detail = `${def.label} 관련 항목은 확인되었으나, 미적용/Not Covered/제외로 표시된 부분이 있습니다. 제출요건 충족 여부는 해당 보장 적용 여부를 원본에서 확인하세요.`;
    }

    return { key, label: def.label, status, evidence, strongHits, notCoveredHits, coveredHits, detail, def };
  }

  function buildInsuranceCard(summary, text, textProfile) {
    const checks = summary.def.checks.map(check => {
      const hits = collectKeywords(text, check.keywords).slice(0, 6);
      return {
        label: check.label,
        keywords: check.keywords,
        hits,
        status: textProfile.status === '판독 어려움' ? '판독 어려움' : hits.length ? '확인 후보' : '미확인'
      };
    });
    return { ...summary, checks };
  }

  function buildCommonChecks(text, selectedCommon, textProfile, englishProfile) {
    const selectedMap = { period: true, vendor: true, address: true };
    selectedCommon.forEach(key => { selectedMap[key] = true; });
    return COMMON_CHECK_DEFINITIONS
      .filter(item => selectedMap[item.key] || !['period', 'vendor', 'address'].includes(item.key))
      .map(item => {
        let hits = collectKeywords(text, item.keywords).slice(0, 6);
        if (item.key === 'period') hits = [...new Set([...hits, ...findPeriods(text).slice(0, 2)])].slice(0, 6);
        if (item.key === 'vendor') hits = [...new Set([...hits, ...findVendorCandidates(text).slice(0, 2)])].slice(0, 6);
        if (item.key === 'address') hits = [...new Set([...hits, ...findAddressCandidates(text).slice(0, 2)])].slice(0, 6);
        if (item.key === 'amount') hits = [...new Set([...hits, ...findAmountCandidates(text).slice(0, 2)])].slice(0, 6);
        if (item.key === 'policyNo') hits = [...new Set([...hits, ...findPolicyNumbers(text).slice(0, 2)])].slice(0, 6);
        const status = textProfile.status === '판독 어려움' ? '판독 어려움' : hits.length ? '확인 후보' : (englishProfile.isEnglish ? '확인 필요' : '관련 문구 없음');
        return { ...item, hits, status };
      });
  }

  function buildCautions(clauseHits, pageCandidates, textProfile, englishProfile, extractions) {
    const cautions = [];
    if (clauseHits.length) {
      cautions.push({
        title: '약관·면책 조항 페이지 추정',
        status: '약관 페이지 추정',
        hits: clauseHits.slice(0, 8),
        detail: 'Exclusion, Clause, Endorsement 등 약관·면책 조항 표현이 확인되었습니다. 이 페이지는 주요 가입정보보다 약관 확인용에 가깝습니다. 보험기간, 피보험자, 주소, 보상한도는 증권 첫 장 또는 가입증명서 요약 페이지에서 확인하세요.'
      });
    }
    if (pageCandidates.length) {
      cautions.push({
        title: '핵심 확인 페이지 후보',
        status: '확인 후보',
        hits: pageCandidates.slice(0, 5),
        detail: '증권번호, 보험기간, 피보험자, 보상한도 등 핵심 정보가 함께 있을 가능성이 높은 페이지입니다.'
      });
    }
    if (textProfile.status !== '텍스트 인식됨') {
      cautions.push({
        title: 'OCR 판독 확인',
        status: textProfile.status === '판독 어려움' ? '판독 어려움' : 'OCR 확인 필요',
        hits: extractions.filter(item => /OCR/i.test(item.method)).map(item => item.file.name).slice(0, 4),
        detail: textProfile.status === '판독 어려움'
          ? '텍스트 인식이 충분하지 않습니다. 이미지 품질이 낮거나 스캔본이 흐려 일부 내용을 읽지 못했을 수 있습니다. 선명한 PDF 또는 원본 이미지로 다시 확인해 주세요.'
          : '일부 파일은 OCR로 판독되었습니다. 이미지 기반 서류는 일부 항목이 누락될 수 있으므로 원본 확인이 필요합니다.'
      });
    }
    if (!cautions.length) {
      cautions.push({ title: '참고/주의 사항', status: '확인 필요', hits: [], detail: '약관·면책 조항이나 OCR 판독 문제는 크게 감지되지 않았습니다. 그래도 최종 판단은 원본 서류 기준으로 확인하세요.' });
    }
    return cautions;
  }

  function flattenStructuredRows(structured) {
    const rows = [];
    structured.readingSummary.forEach(item => rows.push({ item: `판독 요약 - ${item.label}`, status: item.value, detail: item.value }));
    structured.insuranceSummaries.forEach(item => rows.push({ item: item.label, status: item.status, detail: item.evidence.length ? `근거: ${item.evidence.join(', ')} / ${item.detail}` : item.detail }));
    structured.commonChecks.forEach(item => rows.push({ item: `공통 확인 - ${item.label}`, status: item.status, detail: item.hits.length ? `확인 근거: ${item.hits.join(', ')}` : `${item.label} 관련 문구는 뚜렷하게 확인되지 않았습니다.` }));
    structured.cautions.forEach(item => rows.push({ item: item.title, status: item.status, detail: item.detail }));
    return rows;
  }

  function analyzeTextQuality(extractions, allText) {
    const text = String(allText || '').trim();
    const charCount = text.replace(/\s/g, '').length;
    const ocrCount = extractions.filter(item => /OCR/i.test(item.method)).length;
    const emptyCount = extractions.filter(item => !item.text.trim()).length;
    const keywordCount = collectKeywords(text, [...ENGLISH_CORE_KEYWORDS, ...ENGLISH_CLAUSE_KEYWORDS, ...KEYWORDS.fire, ...KEYWORDS.business, ...KEYWORDS.product, ...KEYWORDS.travel]).length;
    if (charCount < 40 || emptyCount === extractions.length) return { status: '판독 어려움', tone: 'danger', charCount, keywordCount };
    if (charCount < 150 || (ocrCount && keywordCount < 2)) return { status: '일부 인식됨', tone: 'warn', charCount, keywordCount };
    return { status: '텍스트 인식됨', tone: 'ok', charCount, keywordCount };
  }

  function detectLanguageLabel(text) {
    const source = String(text || '');
    const asciiLetters = (source.match(/[A-Za-z]/g) || []).length;
    const koreanLetters = (source.match(/[가-힣]/g) || []).length;
    if (asciiLetters >= 20 && koreanLetters >= 20) {
      const ratio = Math.max(asciiLetters, koreanLetters) / Math.max(1, Math.min(asciiLetters, koreanLetters));
      if (ratio <= 2.5) return '국문/영문 혼합';
    }
    if (asciiLetters >= 30 && asciiLetters > koreanLetters * 1.4) return '영문 중심';
    if (koreanLetters >= 30 && koreanLetters > asciiLetters * 1.4) return '국문 중심';
    if (asciiLetters >= 20 && koreanLetters >= 20) return '국문/영문 혼합';
    return '언어 판단 어려움';
  }

  function detectDocumentNature(englishProfile, clauseHits, pageCandidates, text) {
    const policyHits = collectKeywords(text, [...KEYWORDS.policy, ...ENGLISH_CORE_KEYWORDS, '총괄명세서', '보험기간', '피보험자명', '계약자명']);
    const coverageHits = collectKeywords(text, [...PAGE_ROLE_KEYWORDS.coverage, '재물종합위험보장', '배상책임위험보장']);
    const clauseAllHits = [...new Set([...clauseHits, ...collectKeywords(text, PAGE_ROLE_KEYWORDS.clause)])];
    if (clauseAllHits.length >= 3 && (pageCandidates.length || policyHits.length >= 2 || coverageHits.length >= 2)) return '보험증권/약관 혼합 가능성';
    if (clauseAllHits.length >= 3) return '약관/면책 조항 페이지 가능성';
    if (pageCandidates.length || policyHits.length >= 2 || coverageHits.length >= 2) return '보험증권/보장 상세 페이지 가능성';
    if (hasAny(text, [...KEYWORDS.fire, ...KEYWORDS.business, ...KEYWORDS.product, ...KEYWORDS.travel, ...KEYWORDS.policy])) return '보험서류 가능성';
    return '보험서류 여부 추가 확인 필요';
  }

  function rowFromKeyword(item, text, keywords, successDetail) {
    const hits = collectKeywords(text, keywords);
    const englishProfile = analyzeEnglishDocument(text);
    const englishHits = hits.filter(hit => /[A-Za-z]/.test(hit));
    const koreanHits = hits.filter(hit => /[가-힣]/.test(hit));
    const guide = ENGLISH_ITEM_GUIDES[item];

    if (englishProfile.isEnglish && item === '보험 약관' && englishProfile.clauseHits.length) {
      return {
        item,
        status: '약관 페이지 추정',
        detail: `약관·면책 조항 표현 확인: ${englishProfile.clauseHits.slice(0, 4).join(', ')}. 이 페이지는 주요 가입정보보다 약관 확인용에 가깝습니다.`
      };
    }

    if (hits.length) {
      if (englishProfile.isEnglish && englishHits.length && !koreanHits.length) {
        return {
          item,
          status: guide?.foundStatus || '영문 후보 확인',
          detail: `${guide?.found || '영문 문서에서 관련 표현이 확인되었습니다.'} 확인된 표현: ${englishHits.slice(0, 4).join(', ')}`
        };
      }
      return { item, status: '확인됨', detail: `${successDetail}: ${hits.slice(0, 4).join(', ')}` };
    }

    const similar = weakMatch(item, text);
    if (similar) {
      return {
        item,
        status: englishProfile.isEnglish ? '확인 필요' : '확인 필요',
        detail: englishProfile.isEnglish
          ? `${guide?.missing || '관련 영문 표현은 뚜렷하게 확인되지 않았습니다. 원본 증권 요약 페이지에서 확인하세요.'}`
          : '유사 문구가 있어 원본 서류 확인이 필요합니다.'
      };
    }

    if (englishProfile.isEnglish) {
      return {
        item,
        status: guide?.missing ? '확인 필요' : '관련 문구 없음',
        detail: guide?.missing || '해당 항목 관련 영문 표현은 뚜렷하게 확인되지 않았습니다. 원본 증권 요약 페이지를 확인하세요.'
      };
    }
    return { item, status: '누락 의심', detail: '해당 항목 관련 문구를 찾지 못했습니다.' };
  }

  function buildOpinion(rows, structured) {
    if (!structured) return '';
    const lines = [];
    lines.push('[판독 요약]');
    structured.readingSummary.forEach(item => lines.push(`- ${item.label}: ${item.value}`));
    lines.push('', '[감지된 보험 종류]');
    structured.insuranceSummaries.forEach(item => {
      lines.push(`- ${item.label}: ${item.status}${item.evidence.length ? ` / 근거: ${item.evidence.join(', ')}` : ''}`);
    });
    lines.push('', '[공통 확인 항목]');
    structured.commonChecks.forEach(item => {
      lines.push(`- ${item.label}: ${item.status}${item.hits.length ? ` / 근거: ${item.hits.join(', ')}` : ''}`);
    });
    const found = structured.insuranceSummaries.filter(item => item.status === '확인됨' || item.status === '확인 후보').map(item => item.label);
    const none = structured.insuranceSummaries.filter(item => item.status === '관련 문구 없음').map(item => item.label);
    lines.push('', '[검토 의견]');
    if (found.length) lines.push(`${found.join(', ')} 관련 표현이 확인되었거나 확인 후보로 보입니다. 해당 보험별 확인 항목을 원본에서 함께 확인해 주세요.`);
    if (none.length) lines.push(`${none.join(', ')} 관련 표현은 뚜렷하게 확인되지 않았습니다. 제출 필요 여부와 원본 증권 요약 페이지를 추가 확인해 주세요.`);
    structured.cautions.forEach(item => lines.push(`${item.title}: ${item.detail}`));
    lines.push('보험콕검 결과는 검토 보조용이며, 최종 판단은 담당자가 원본 서류에서 직접 진행해야 합니다.');
    return lines.join('\n');
  }

  function renderResults() {
    const counts = countStatuses(state.rows);
    els.okCount.textContent = `${(counts['확인됨'] || 0) + (counts['확인 후보'] || 0)}건`;
    els.warnCount.textContent = `${(counts['확인 필요'] || 0) + (counts['핵심 페이지 확인 필요'] || 0) + (counts['미적용 가능성'] || 0) + (counts['영문 확인 필요'] || 0) + (counts['영문 후보 확인'] || 0) + (counts['관련 문구 없음'] || 0) + (counts['약관 페이지 추정'] || 0) + (counts['OCR 확인 필요'] || 0)}건`;
    els.missingCount.textContent = `${counts['누락 의심'] || 0}건`;
    els.hardCount.textContent = `${(counts['분석 어려움'] || 0) + (counts['판독 어려움'] || 0)}건`;

    if (els.checklistBody) {
      els.checklistBody.innerHTML = state.rows.map(row => `
        <tr>
          <td>${escapeHtml(row.item)}</td>
          <td>${statusBadge(row.status)}</td>
          <td>${escapeHtml(row.detail)}</td>
        </tr>
      `).join('');
    }

    if (els.structuredResult) {
      els.structuredResult.innerHTML = renderStructuredResult(state.structuredResult);
    }

    els.fileAnalysis.innerHTML = state.fileResults.map(result => `
      <div class="analysis-card">
        <strong>${escapeHtml(result.fileName)}</strong>
        <p>└ ${escapeHtml(result.summary)}</p>
      </div>
    `).join('');

    els.pointsContent.innerHTML = Object.entries(state.pointGroups).map(([title, items]) => `
      <div class="point-block">
        <h4>${escapeHtml(title)}</h4>
        ${items.length ? `<ul>${items.slice(0, 8).map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p class="hint">확인된 후보가 없습니다.</p>'}
      </div>
    `).join('');

    els.opinionText.value = state.opinion;
    document.body.classList.add('is-analyzed');
    const typeCount = selectedValues('type').length;
    if (els.inputSummaryText) els.inputSummaryText.textContent = `${typeCount ? typeCount + '개 보험 항목' : '선택 항목 없음'} · 파일 ${state.files.length}개 분석 완료`;
    els.inputSummary?.classList.remove('hidden');
    updateBottomAction();
    els.resultsSection.classList.remove('hidden');
    els.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderStructuredResult(result) {
    if (!result) return '';

    const ocrItem = result.readingSummary.find(item => item.label === 'OCR 상태');
    const langItem = result.readingSummary.find(item => item.label === '문서 언어');
    const natureItem = result.readingSummary.find(item => item.label === '문서 성격');
    const readLine = [ocrItem?.value, langItem?.value, natureItem?.value].filter(Boolean).join(' · ');
    const ocrNote = buildOcrNote(result, ocrItem?.value || '');

    const insuranceCards = result.insuranceSummaries.map(item => {
      const oneLine = item.evidence.length
        ? `${item.evidence[0]} 관련 표현 확인`
        : `${firstKeyword(item.def?.strong || item.def?.related || []) || item.label} 미확인`;
      return `
        <article class="summary-type-card ${statusClass(item.status)}">
          <div class="summary-type-title">${escapeHtml(item.label)}</div>
          ${statusBadge(item.status)}
          <p>${escapeHtml(oneLine)}</p>
        </article>
      `;
    }).join('');

    const detailCards = result.insuranceCards.map(card => {
      const found = card.checks.flatMap(check => check.hits).filter(Boolean);
      const foundUnique = [...new Set([...(card.evidence || []), ...(card.notCoveredHits || []), ...(card.coveredHits || []), ...found])].slice(0, 10);
      const needed = card.checks
        .filter(check => !check.hits.length)
        .flatMap(check => check.keywords.slice(0, 2))
        .filter(Boolean);
      const neededUnique = [...new Set(needed)].slice(0, 8);
      const confirmText = card.status === '관련 문구 없음'
        ? '해당 보험 관련 핵심 문구가 뚜렷하지 않습니다. 아래 문구가 있는지 원본에서 확인하세요.'
        : card.status === '판독 어려움'
          ? 'OCR 판독이 충분하지 않아 보험별 판단이 어렵습니다. 선명한 원본으로 다시 확인하세요.'
          : shortConfirmText(card);
      return `
        <article class="readable-insurance-card ${statusClass(card.status)}">
          <div class="readable-card-head">
            <h4>${escapeHtml(card.label)}</h4>
            ${statusBadge(card.status)}
          </div>
          <div class="quick-judge">
            <p><b>판단</b><span>${escapeHtml(card.status)}</span></p>
            <p><b>근거</b><span>${foundUnique.length ? foundUnique.slice(0, 5).map(escapeHtml).join(', ') : '관련 핵심 문구 미확인'}</span></p>
            <p><b>확인</b><span>${escapeHtml(confirmText)}</span></p>
          </div>
          <div class="keyword-split">
            <div class="keyword-box found">
              <strong>찾은 문구</strong>
              ${renderKeywordTags(foundUnique, card.status === '핵심 페이지 확인 필요' ? '핵심 문구를 충분히 판독하지 못했습니다.' : '찾은 문구 없음')}
            </div>
            <div class="keyword-box needed">
              <strong>추가로 확인할 문구</strong>
              ${renderKeywordTags(neededUnique, '추가 확인 문구 없음')}
            </div>
          </div>
          <details class="check-details">
            <summary>이 보험에서 봐야 할 내용</summary>
            <ul>
              ${card.checks.map(check => `<li><b>${escapeHtml(check.label)}</b><span>${check.keywords.slice(0, 4).map(keyword => `<em>${escapeHtml(keyword)}</em>`).join('')}</span></li>`).join('')}
            </ul>
          </details>
        </article>
      `;
    }).join('');

    const pageCandidateBlock = renderPageCandidateBlock(result.ocrDiagnostics, result.pageCandidates);
    const ocrDiagnosticBlock = renderOcrDiagnosticBlock(result.ocrDiagnostics);

    const commonSummary = '보험기간 · 피보험자/계약자 · 주소/소재지 · 보상한도 · 증권번호를 함께 확인하세요.';
    const commonDetails = result.commonChecks.map(item => `
      <li>
        <b>${escapeHtml(item.label)}</b>
        ${statusBadge(item.status)}
        <span>${item.hits.length ? item.hits.map(hit => `<em>${escapeHtml(hit)}</em>`).join('') : '확인 후보가 뚜렷하지 않습니다.'}</span>
      </li>
    `).join('');

    const cautions = result.cautions
      .filter(item => item.status === '약관 페이지 추정' || item.status === '판독 어려움' || item.status === 'OCR 확인 필요')
      .map(item => `
        <div class="readable-caution ${statusClass(item.status)}">
          <div>${statusBadge(item.status)}</div>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.detail)}</p>
          ${item.hits.length ? `<div class="inline-tags">${item.hits.slice(0, 6).map(hit => `<em>${escapeHtml(hit)}</em>`).join('')}</div>` : ''}
        </div>
      `).join('');

    return `
      <section class="structured-block compact-summary-block">
        <h4>판독 요약</h4>
        <div class="reading-one-line">${escapeHtml(readLine || '판독 상태 확인 필요')}</div>
        ${ocrNote ? `<p class="ocr-note">${escapeHtml(ocrNote)}</p>` : ''}
      </section>
      ${pageCandidateBlock}
      <section class="structured-block">
        <h4>보험 종류 요약</h4>
        <div class="summary-type-grid">${insuranceCards}</div>
      </section>
      <section class="structured-block">
        <h4>보험별 검토 카드</h4>
        <div class="readable-card-list">${detailCards}</div>
      </section>
      <section class="structured-block">
        <details class="common-details">
          <summary>
            <span><b>공통 확인 항목</b>${escapeHtml(commonSummary)}</span>
            <i>보기</i>
          </summary>
          <ul>${commonDetails}</ul>
        </details>
      </section>
      ${cautions ? `<section class="structured-block"><h4>약관·면책/OCR 안내</h4><div class="readable-caution-list">${cautions}</div></section>` : ''}
      ${ocrDiagnosticBlock}
    `;
  }


  function renderPageCandidateBlock(diagnostics, pageCandidates) {
    const items = diagnostics?.candidateLines?.length ? diagnostics.candidateLines : (pageCandidates || []);
    if (!items || !items.length) return '';
    return `
      <section class="structured-block page-candidate-block">
        <h4>핵심 확인 페이지 후보</h4>
        <ul>
          ${items.slice(0, 8).map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </section>
    `;
  }

  function renderOcrDiagnosticBlock(diagnostics) {
    if (!diagnostics || !diagnostics.pages || !diagnostics.pages.length) return '';
    return `
      <section class="structured-block ocr-diagnostic-block">
        <details>
          <summary><b>페이지별 판독 상태 보기</b><span>앱이 실제로 읽은 문구와 페이지 역할을 확인합니다.</span></summary>
          <div class="ocr-page-list">
            ${diagnostics.pages.map(page => `
              <article class="ocr-page-card ${statusClass(page.status)}">
                <div class="ocr-page-head">
                  <strong>${escapeHtml(page.fileName)} · ${page.pageNo}쪽</strong>
                  ${statusBadge(page.status)}
                </div>
                <p><b>텍스트 길이</b><span>${escapeHtml(String(page.length))}자</span></p>
                <p><b>페이지 역할</b><span>${escapeHtml(page.role)}</span></p>
                <p><b>감지 키워드</b><span>${page.keywords.length ? page.keywords.slice(0, 8).map(escapeHtml).join(', ') : '감지 키워드 없음'}</span></p>
                <details class="ocr-raw-text">
                  <summary>OCR 원문 일부 보기</summary>
                  <pre>${escapeHtml(page.preview || 'OCR 원문 없음')}</pre>
                </details>
              </article>
            `).join('')}
          </div>
        </details>
      </section>
    `;
  }

  function buildOcrNote(result, ocrStatus) {
    const usedEnhanced = state.extractedTexts.some(item => /보정 OCR/.test(item.method) || /이미지 보정/.test(item.warning || ''));
    if (ocrStatus === '판독 어려움') return '텍스트 인식이 충분하지 않습니다. 이미지 품질이 낮거나 스캔본이 흐려 일부 내용을 읽지 못했을 수 있습니다.';
    if (usedEnhanced) return '이미지 보정 후 다시 판독했습니다. 일부 항목은 원본 증권 첫 장에서 확인이 필요할 수 있습니다.';
    return '';
  }

  function firstKeyword(list) {
    return Array.isArray(list) && list.length ? list[0] : '';
  }

  function shortConfirmText(card) {
    const label = card.label || '';
    if (label.includes('화재')) return '보험기간, 소재지, 가입금액을 함께 확인하세요.';
    if (label.includes('영업')) return 'Limit of Liability와 Any One Occurrence 등 사고당 보상한도를 확인하세요.';
    if (card.status === '미적용 가능성') return '관련 항목은 보이지만 미적용/Not Covered/제외 표시가 있는지 원본에서 확인하세요.';
    if (label.includes('생산물')) return 'Products Liability와 Aggregate Limit 및 보장 적용 여부를 함께 확인하세요.';
    if (label.includes('여행자')) return 'Coverage Period, Accident, Medical Expenses 문구를 함께 확인하세요.';
    return '보험기간, 피보험자, 주소, 보상한도 문구를 함께 확인하세요.';
  }

  function renderKeywordTags(items, emptyText) {
    const list = (items || []).filter(Boolean).slice(0, 10);
    if (!list.length) return `<p class="empty-keyword">${escapeHtml(emptyText)}</p>`;
    return `<div class="keyword-tags">${list.map(item => `<em>${escapeHtml(item)}</em>`).join('')}</div>`;
  }

  function toneClass(tone) {
    return tone ? `tone-${String(tone).replace(/[^a-z0-9_-]/gi, '')}` : '';
  }

  function statusClass(status) {
    if (status === '확인됨') return 'status-ok';
    if (status === '확인 후보') return 'status-candidate';
    if (status === '핵심 페이지 확인 필요') return 'status-pagecheck';
    if (status === '미적용 가능성') return 'status-excluded';
    if (status === '관련 문구 없음') return 'status-none';
    if (status === '약관 페이지 추정') return 'status-clause';
    if (status === '판독 어려움' || status === '판독 약함' || status === '판독 실패' || status === '분석 어려움') return 'status-hard';
    return 'status-warn';
  }

  function selectedValues(name) {
    return $$(`input[name="${name}"]:checked`).map(input => input.value);
  }

  function findContextualStatusHits(text, topicKeywords, statusKeywords) {
    const lines = String(text || '').split(/\n|\r/).map(line => normalizeText(line)).filter(Boolean);
    const hits = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!hasAny(line, topicKeywords)) continue;
      // 같은 행에 보장상태가 붙어 있는 경우를 가장 신뢰한다.
      let statusHits = collectKeywords(line, statusKeywords);
      // OCR이 표 행을 둘로 쪼갠 경우에만 바로 다음 행까지 허용한다.
      if (!statusHits.length && i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.length <= 80) statusHits = collectKeywords(`${line} ${next}`, statusKeywords);
      }
      if (statusHits.length) hits.push(...statusHits);
    }
    return [...new Set(hits)].slice(0, 6);
  }

  function hasAny(text, keywords) {
    const compact = normalizeText(text).replace(/\s+/g, '').toLowerCase();
    return keywords.some(keyword => compact.includes(normalizeText(keyword).replace(/\s+/g, '').toLowerCase()));
  }

  function collectKeywords(text, keywords) {
    const compact = normalizeText(text).replace(/\s+/g, '').toLowerCase();
    const found = [];
    keywords.forEach(keyword => {
      if (compact.includes(normalizeText(keyword).replace(/\s+/g, '').toLowerCase())) found.push(keyword);
    });
    return [...new Set(found)];
  }

  function weakMatch(item, text) {
    if (!text) return false;
    const compact = normalizeText(text).replace(/\s+/g, '');
    const tokens = normalizeText(item).split(/[·\s]+/).filter(token => token.length >= 2);
    return tokens.some(token => compact.includes(token));
  }

  function findPeriods(text) {
    const patterns = [
      /\d{4}[.\-\/년\s]+\d{1,2}[.\-\/월\s]+\d{1,2}\s*(?:일)?\s*[~∼-]\s*\d{4}[.\-\/년\s]+\d{1,2}[.\-\/월\s]+\d{1,2}/g,
      /\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/g,
      /\d{4}년\s*\d{1,2}월\s*\d{1,2}일/g,
      /(?:Period of Insurance|Policy Period|Insurance Period|Coverage Period|Effective Date|Expiry Date|Expiration Date|Inception Date)\s*[:：]?\s*[^\n]{0,90}/gi,
      /\b\d{1,2}\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s*\d{4}\b/gi,
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s*\d{1,2},?\s*\d{4}\b/gi,
      /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g
    ];
    return uniqueMatches(text, patterns).slice(0, 8);
  }

  function findAmountCandidates(text) {
    const patterns = [
      /(?:사고당|사고\s*당|1\s*사고당|일\s*사고당|보험금액|가입금액|보상한도|배상한도|보장한도)[^\n]{0,40}?(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:원|만원|천만원|억원)/g,
      /(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:원|만원|천만원|억원)[^\n]{0,25}?(?:사고당|사고\s*당|보험금액|가입금액|보상한도|배상한도|보장한도)/g,
      /(?:\d+)\s*(?:억|억원|천만원|만원)/g,
      /(?:Limit of Liability|Liability Limit|Coverage Limit|Sum Insured|Amount Insured|Indemnity Limit|Any One Occurrence|Any One Accident|Aggregate Limit)[^\n]{0,80}?(?:USD|KRW|\$|₩)?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?/gi,
      /(?:USD|KRW|\$|₩)\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?[^\n]{0,60}?(?:Limit|Liability|Insured|Occurrence|Accident|Aggregate)/gi
    ];
    return uniqueMatches(text, patterns).slice(0, 10);
  }

  function findVendorCandidates(text) {
    const lines = text.split(/\n|\r/).map(line => line.trim()).filter(Boolean);
    const candidates = [];
    const patterns = [
      /피보험자\s*[:：]?\s*([^\n]{2,50})/i, /계약자\s*[:：]?\s*([^\n]{2,50})/i, /상호\s*[:：]?\s*([^\n]{2,50})/i, /업체명\s*[:：]?\s*([^\n]{2,50})/i,
      /(?:Named\s+Insured|Name\s+of\s+Insured|The\s+Insured|Insured|Policyholder|Assured|Applicant)\s*[:：]?\s*([^\n]{2,70})/i
    ];
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]) candidates.push(cleanCandidate(match[1]));
      }
    }
    return [...new Set(candidates.filter(Boolean))].slice(0, 8);
  }

  function findAddressCandidates(text) {
    const lines = text.split(/\n|\r/).map(line => line.trim()).filter(Boolean);
    const regionPattern = /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충청북도|충남|충청남도|전북|전라북도|전남|전라남도|경북|경상북도|경남|경상남도|제주)[^\n]{5,90}/;
    const englishPattern = /(?:Address|Location|Premises|Risk\s+Location|Insured\s+Location|Situation|Property\s+Insured\s+Location)\s*[:：]?\s*([^\n]{5,100})/i;
    const candidates = [];
    for (const line of lines) {
      const english = line.match(englishPattern);
      if (line.includes('주소') || line.includes('소재지') || line.includes('사업장') || regionPattern.test(line)) {
        candidates.push(cleanCandidate(line));
      }
      if (english?.[1]) candidates.push(cleanCandidate(english[1]));
    }
    return [...new Set(candidates)].slice(0, 8);
  }

  function findPolicyNumbers(text) {
    const patterns = [
      /(?:Policy\s*(?:No\.?|Number)|Certificate\s*(?:No\.?|Number)|Reference\s*No\.?)\s*[:：]?\s*[A-Z0-9\-\/]{4,40}/gi,
      /(?:증권번호|가입증명서번호|계약번호)\s*[:：]?\s*[A-Z0-9가-힣\-\/]{4,40}/gi
    ];
    return uniqueMatches(text, patterns).slice(0, 8);
  }


  function buildOcrDiagnostics(extractions) {
    const pages = [];
    for (const extraction of extractions || []) {
      const chunks = splitIntoPageLikeChunks(extraction.text || extraction.rawText || '');
      chunks.forEach(chunkObj => {
        const text = typeof chunkObj === 'string' ? chunkObj : chunkObj.text;
        const pageNo = typeof chunkObj === 'string' ? pages.length + 1 : chunkObj.pageNo;
        const keywords = collectKeywords(text, [
          ...KEYWORDS.policy, ...KEYWORDS.fire, ...KEYWORDS.business, ...KEYWORDS.product, ...KEYWORDS.travel,
          ...PAGE_ROLE_KEYWORDS.summary, ...PAGE_ROLE_KEYWORDS.coverage, ...PAGE_ROLE_KEYWORDS.clause,
          ...ENGLISH_CORE_KEYWORDS, ...ENGLISH_CLAUSE_KEYWORDS,
          '재물종합위험보장', '배상책임위험보장', 'Products/Completed Operations', 'Not Covered', 'Property All Risks Cover', 'Premises & Operation Liability Coverage'
        ]).slice(0, 12);
        const role = detectPageRole(text);
        const status = classifyPageOcrStatus(text, keywords);
        pages.push({
          fileName: extraction.file?.name || '파일',
          pageNo,
          status,
          length: normalizeText(text).replace(/\s/g, '').length,
          keywords,
          role,
          preview: normalizeText(text).slice(0, 500)
        });
      });
    }
    const hasPolicyStructure = pages.some(page => /보험증권|표지|핵심 요약|보장 상세|Package|Policy/i.test(page.role) || page.keywords.some(keyword => /Package Insurance|보험증권|총괄명세서|Master Schedule|Policy Schedule/i.test(keyword)));
    const hasWeakCorePages = pages.some(page => (page.role.includes('확인 필요') || page.status === '판독 약함' || page.status === '판독 실패') && /재물|배상|보장|핵심|보험증권|상세|요약/.test(page.role));
    const candidateLines = buildCorePageCandidateLines(pages);
    return { pages, hasPolicyStructure, hasWeakCorePages, candidateLines };
  }

  function classifyPageOcrStatus(text, keywords) {
    const length = normalizeText(text || '').replace(/\s/g, '').length;
    if (length < 15) return '판독 실패';
    if (length < 80) return '판독 약함';
    if (length < 180 || !keywords.length) return '일부 인식됨';
    return '텍스트 인식됨';
  }

  function detectPageRole(text) {
    const source = normalizeTextForSearch(text || '');
    const coverHits = collectKeywords(source, ['보험증권', 'Package Insurance Policy', 'Hyundai Marine & Fire Insurance', '현대해상']);
    const summaryHits = collectKeywords(source, PAGE_ROLE_KEYWORDS.summary);
    const propertyHits = collectKeywords(source, ['재물종합위험보장', '섹션 I', '섹션Ⅰ', 'Property All Risks Cover', 'Property Insured', 'Total Sum Insured', 'Building', 'Facility', '보험가입금액', '건물 및 부속설비']);
    const liabilityHits = collectKeywords(source, ['배상책임위험보장', '섹션 IV', '섹션Ⅳ', 'Liability Coverage', 'Premises & Operation Liability Coverage', 'Combined Single Limit', 'Bodily Injury', 'Property Damage']);
    const clauseHits = collectKeywords(source, PAGE_ROLE_KEYWORDS.clause);
    if (summaryHits.length >= 2) return '핵심 요약 페이지 후보';
    if (propertyHits.length >= 2) return '재물보장 상세 페이지 후보';
    if (liabilityHits.length >= 2) return '배상책임 상세 페이지 후보';
    if (clauseHits.length >= 3) return '약관/조건 페이지 후보';
    if (coverHits.length) return '표지/보험증권 표지 가능성';
    if (source.length < 80) return '페이지 역할 확인 필요';
    return '관련 페이지 후보';
  }

  function buildCorePageCandidateLines(pages) {
    const lines = [];
    const pushFirst = (pattern, label) => {
      const found = pages.find(page => pattern.test(page.role) || page.keywords.some(keyword => pattern.test(keyword)));
      if (found) lines.push(`${label}: ${found.pageNo}쪽 ${found.status === '텍스트 인식됨' ? '확인 후보' : '확인 필요'}`);
    };
    pushFirst(/핵심 요약|총괄명세서|Master Schedule|Policy Schedule/i, '총괄명세서');
    pushFirst(/재물보장|재물종합위험보장|Property All Risks/i, '재물보장 상세');
    pushFirst(/배상책임|Liability/i, '배상책임 상세');
    const clausePages = pages.filter(page => /약관|조건|Clause|Exclusion|Conditions/i.test(page.role) || page.keywords.some(keyword => /Clause|Exclusion|Conditions|보험조건|특별조항/.test(keyword))).map(page => `${page.pageNo}쪽`);
    if (clausePages.length) lines.push(`약관/조건 페이지: ${clausePages.slice(0, 4).join(', ')} 참고`);
    if (!lines.length && pages.some(page => /보험증권|Package/i.test(page.role) || page.keywords.some(keyword => /Package Insurance|보험증권/.test(keyword)))) {
      lines.push('보험증권 구조 감지: 총괄명세서와 보장 상세 페이지를 원본에서 확인하세요.');
    }
    return [...new Set(lines)];
  }

  function analyzeEnglishDocument(text) {
    const source = String(text || '');
    const compact = source.toLowerCase();
    const asciiLetters = (source.match(/[A-Za-z]/g) || []).length;
    const koreanLetters = (source.match(/[가-힣]/g) || []).length;
    const isEnglish = asciiLetters >= 30 && asciiLetters > koreanLetters;
    const coreHits = collectKeywords(source, ENGLISH_CORE_KEYWORDS);
    const clauseHits = collectKeywords(source, ENGLISH_CLAUSE_KEYWORDS);
    const coreScore = coreHits.length * 2
      + Math.min(findPolicyNumbers(source).length, 2) * 3
      + Math.min(findPeriods(source).length, 2) * 2
      + Math.min(findAmountCandidates(source).length, 2) * 2
      + Math.min(findVendorCandidates(source).length, 2)
      + Math.min(findAddressCandidates(source).length, 2);
    const clauseScore = clauseHits.length + ((source.match(/Exclusion|Clause|Endorsement/gi) || []).length);
    const isClauseHeavy = isEnglish && clauseScore >= 4 && coreScore < 8;
    return { isEnglish, coreHits, clauseHits, coreScore, clauseScore, isClauseHeavy };
  }

  function findEnglishPageCandidates(extractions) {
    const candidates = [];
    for (const extraction of extractions) {
      const chunks = splitIntoPageLikeChunks(extraction.text);
      chunks.forEach((chunkObj, index) => {
        const chunk = typeof chunkObj === 'string' ? chunkObj : chunkObj.text;
        const pageNo = typeof chunkObj === 'string' ? index + 1 : chunkObj.pageNo;
        const profile = analyzeEnglishDocument(chunk);
        const summaryHits = collectKeywords(chunk, PAGE_ROLE_KEYWORDS.summary);
        const coverageHits = collectKeywords(chunk, PAGE_ROLE_KEYWORDS.coverage);
        const clauseHits = collectKeywords(chunk, PAGE_ROLE_KEYWORDS.clause);
        const insuranceHits = collectKeywords(chunk, [
          ...INSURANCE_DEFINITIONS.fire.related,
          ...INSURANCE_DEFINITIONS.business.related,
          ...INSURANCE_DEFINITIONS.product.related,
          ...INSURANCE_DEFINITIONS.travel.related,
          ...KEYWORDS.policy
        ]);
        const score = summaryHits.length * 3 + coverageHits.length * 3 + insuranceHits.length + profile.coreScore;
        if (score < 5 && clauseHits.length < 3) return;

        const label = `${extraction.file.name} ${pageNo}쪽`;
        let role = '관련 페이지 후보';
        if (summaryHits.length >= 2) role = '핵심 요약 페이지 후보';
        else if (coverageHits.length >= 2) role = '보장 상세 페이지 후보';
        else if (clauseHits.length >= 3) role = '약관/조건 페이지 후보';
        else if (profile.coreScore >= 5) role = '핵심 확인 페이지 후보';

        const hints = [...summaryHits, ...coverageHits, ...profile.coreHits, ...insuranceHits].slice(0, 4);
        candidates.push(`${label}: ${role}${hints.length ? `(${hints.join(', ')})` : ''}`);
      });
    }
    return [...new Set(candidates)].slice(0, 8);
  }

  function splitIntoPageLikeChunks(text) {
    const source = String(text || '').trim();
    if (!source) return [];
    const regex = /---\s*page\s*(\d+)\s*(?:OCR)?\s*---/ig;
    const chunks = [];
    let match;
    let lastIndex = 0;
    let currentPage = 1;
    while ((match = regex.exec(source)) !== null) {
      if (match.index > lastIndex) {
        const part = source.slice(lastIndex, match.index).trim();
        if (part) chunks.push({ pageNo: currentPage, text: part });
      }
      currentPage = Number(match[1] || chunks.length + 1);
      lastIndex = regex.lastIndex;
    }
    const rest = source.slice(lastIndex).trim();
    if (rest) chunks.push({ pageNo: currentPage, text: rest });
    return chunks.length ? chunks : [{ pageNo: 1, text: source }];
  }

  function uniqueMatches(text, patterns) {
    const matches = [];
    for (const pattern of patterns) {
      const found = text.match(pattern);
      if (found) matches.push(...found.map(cleanCandidate));
    }
    return [...new Set(matches)].filter(Boolean);
  }

  function cleanCandidate(value) {
    return String(value).replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
  }

  function normalizeText(text) {
    return String(text || '')
      .replace(/[［\[【]/g, ' ')
      .replace(/[］\]】]/g, ' ')
      .replace(/[Ⅰ]/g, 'I')
      .replace(/[Ⅱ]/g, 'II')
      .replace(/[Ⅲ]/g, 'III')
      .replace(/[Ⅳ]/g, 'IV')
      .replace(/&/g, ' and ')
      .replace(/미\s*적\s*용/g, '미적용')
      .replace(/배상\s*책임/g, '배상책임')
      .replace(/재물\s*종합\s*위험\s*보장/g, '재물종합위험보장')
      .replace(/배상\s*책임\s*위험\s*보장/g, '배상책임위험보장')
      .replace(/not\s*coverd/gi, 'Not Covered')
      .replace(/not\s*covered/gi, 'Not Covered')
      .replace(/notcovered/gi, 'Not Covered')
      .replace(/not\s*applied/gi, 'Not Applied')
      .replace(/products\s*\/\s*completed\s*operations/gi, 'Products/Completed Operations')
      .replace(/premises\s*(?:and|&)\s*operation(?:s)?\s*liability/gi, 'Premises and Operation Liability')
      .replace(/combined\s*single\s*limit/gi, 'Combined Single Limit')
      .replace(/package\s*insurance\s*policy\s*\(?\s*ii\s*\)?/gi, 'Package Insurance Policy II')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(line => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n');
  }

  function countStatuses(rows) {
    return rows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, { '확인됨': 0, '확인 후보': 0, '확인 필요': 0, '핵심 페이지 확인 필요': 0, '영문 확인 필요': 0, '영문 후보 확인': 0, '관련 문구 없음': 0, '미적용 가능성': 0, '약관 페이지 추정': 0, 'OCR 확인 필요': 0, '누락 의심': 0, '분석 어려움': 0, '판독 어려움': 0 });
  }

  function statusBadge(status) {
    let cls = 'gray';
    if (status === '확인됨' || status === '확인 후보') cls = 'ok';
    else if (status === '미적용 가능성') cls = 'excluded';
    else if (status === '확인 필요' || status === '핵심 페이지 확인 필요' || status === '영문 확인 필요' || status === '영문 후보 확인' || status === 'OCR 확인 필요') cls = 'warn';
    else if (status === '약관 페이지 추정') cls = 'clause';
    else if (status === '판독 약함' || status === '판독 실패' || status === '판독 어려움' || status === '분석 어려움') cls = 'danger';
    else if (status === '누락 의심' || status === '관련 문구 없음') cls = 'danger';
    return `<span class="status ${cls}">${status}</span>`;
  }

  function showProgress(percent, text) {
    els.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
    els.progressText.textContent = text;
  }

  function updateStep(active) {
    const raw = Number(active);
    const current = raw >= 5 ? 3 : raw === 4 ? 2 : 1;
    $$('.step').forEach(step => {
      const stepNo = Number(step.dataset.step);
      step.classList.toggle('is-active', stepNo === current);
      step.classList.toggle('is-done', stepNo < current);
    });
    $$('.status-step').forEach(step => {
      const stepNo = Number(step.dataset.step);
      step.classList.toggle('is-active', stepNo === current);
      step.classList.toggle('is-done', stepNo < current);
    });
    $$('.flow-card').forEach((card, index) => {
      const stepNo = index + 1;
      card.classList.toggle('is-active', stepNo === Math.min(current, 3));
      card.classList.toggle('is-done', stepNo < Math.min(current, 3));
    });
  }

  function updateBottomAction() {
    const selectedCount = $$('input[type="checkbox"]:checked').length;
    if (els.bottomStatus) els.bottomStatus.textContent = `선택 항목 ${selectedCount}개 · 파일 ${state.files.length}개`;
    const disabled = !state.files.length || els.runButton.disabled;
    if (els.bottomRunButton) els.bottomRunButton.disabled = disabled;
  }

  function formatBytes(bytes) {
    if (!bytes) return '0B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / 1024 ** idx).toFixed(idx === 0 ? 0 : 1)}${units[idx]}`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function copyOpinion() {
    navigator.clipboard.writeText(els.opinionText.value).then(() => alert('검토 의견을 복사했습니다.'));
  }

  function saveOpinionTxt() {
    downloadText('boheom-kockgum-opinion.txt', els.opinionText.value, 'text/plain;charset=utf-8');
  }

  function copyAllResults() {
    navigator.clipboard.writeText(buildPlainResult()).then(() => alert('결과 전체를 복사했습니다.'));
  }

  function downloadCsv() {
    const contractName = $('#contractName').value.trim();
    const vendorName = $('#vendorName').value.trim();
    const headers = ['검토일시', '검토유형', '검토항목', '상태', '확인내용', '관련 파일', '참고 문구', '비고'];
    if (contractName || vendorName) {
      headers.splice(2, 0, '계약명', '기준 업체명');
    }
    const now = new Date().toLocaleString('ko-KR');
    const relatedFiles = state.files.map(file => file.name).join(' / ');
    const rows = state.rows.map(row => {
      const base = [now, '보험콕검', row.item, row.status, row.detail, relatedFiles, '', '최종 확인은 담당자 원본 확인'];
      if (contractName || vendorName) base.splice(2, 0, contractName, vendorName);
      return base;
    });
    const csv = toCsv([headers, ...rows]);
    downloadText('boheom-kockgum-checklist.csv', '\ufeff' + csv, 'text/csv;charset=utf-8');
  }

  function buildPlainResult() {
    const lines = ['[보험콕검 결과]', ''];
    state.rows.forEach(row => lines.push(`- ${row.item}: ${row.status} / ${row.detail}`));
    lines.push('', '[검토 의견]', state.opinion);
    return lines.join('\n');
  }

  function toCsv(rows) {
    return rows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  }

  function downloadText(filename, text, mimeType) {
    const blob = new Blob([text], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    if (!confirm('입력과 분석 결과를 초기화할까요?')) return;
    state.files = [];
    state.rows = [];
    state.fileResults = [];
    state.pointGroups = {};
    state.structuredResult = null;
    state.opinion = '';
    state.extractedTexts = [];
    els.fileInput.value = '';
    $('#contractName').value = '';
    $('#vendorName').value = '';
    $$('input[type="checkbox"]').forEach(input => input.checked = true);
    renderFileList();
    els.progressSection.classList.add('hidden');
    els.resultsSection.classList.add('hidden');
    els.inputSummary?.classList.add('hidden');
    document.body.classList.remove('is-analyzed');
    updateBottomAction();
    updateStep(1);
    scrollTop();
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
})();
