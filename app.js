
"use strict";

// ========================================
// データ保存
// ========================================

const DB_NAME = "ImageExperimentApp";
const DB_VERSION = 1;
const STORE_NAME = "projects";

let db;
let projects = [];
let editingProjectId = null;
let currentImages = [];
let previewURLs = [];
let currentScaleLabels = [];

const $ = (id) => document.getElementById(id);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, {
          keyPath: "id"
        });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getAllProjects() {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function saveProject(project) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).put(project);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function deleteProject(id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");

    transaction.objectStore(STORE_NAME).delete(id);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}


// ========================================
// 画面切り替え
// ========================================

function showScreen(screenId) {
  ["home-screen", "editor-screen", "detail-screen"].forEach(id => {
    $(id).classList.toggle("hidden", id !== screenId);
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function showError(message) {
  $("form-error").textContent = message;
}

function clearError() {
  showError("");
}


// ========================================
// プロジェクト一覧
// ========================================

function renderProjectList() {
  const list = $("project-list");
  list.replaceChildren();

  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.id = "empty-project-message";
    empty.textContent =
      "まだプロジェクトがありません。「新規作成」から作成してください。";
    list.appendChild(empty);
    return;
  }

  projects
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach(project => {
      const card = document.createElement("article");
      card.className = "project-card";

      const title = document.createElement("h3");
      title.textContent = project.name;

      const imageInfo = document.createElement("p");
      imageInfo.textContent =
        `画像候補 ${project.images.length}枚 / 提示 ${project.displayCount}枚`;

      const timeInfo = document.createElement("p");
      timeInfo.textContent =
        `提示時間 ${project.displaySeconds}秒 / ` +
        (project.blankEnabled
          ? `ブランク ${project.blankSeconds}秒`
          : "ブランクなし");

      const questionInfo = document.createElement("p");
      questionInfo.textContent = project.ratingEnabled
        ? `評定 ${project.questions.length}項目 / ${project.scaleType === "custom" ? "独自尺度" : project.scaleType + "件法"}`
        : "評定質問なし";

      const actions = document.createElement("div");
      actions.className = "button-row";

      const openButton = document.createElement("button");
      openButton.type = "button";
      openButton.textContent = "詳細";
      openButton.addEventListener("click", () => openProjectDetail(project.id));

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "編集";
      editButton.addEventListener("click", () => openEditor(project.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "削除";
      deleteButton.addEventListener("click", () => removeProject(project.id));

      actions.append(openButton, editButton, deleteButton);
      card.append(title, imageInfo, timeInfo, questionInfo, actions);
      list.appendChild(card);
    });
}


// ========================================
// 新規作成・編集
// ========================================

function resetEditor() {
  $("project-form").reset();
  $("project-name").value = "";
  $("image-files").value = "";
  $("display-count").value = 2;
  $("display-seconds").value = 5;
  $("blank-enabled").checked = true;
  $("blank-seconds").value = 1;
  $("rating-enabled").checked = true;
  $("question-count").value = 2;
  $("rating-timing").value = "each";
  $("likert-count").value = "5";
  $("custom-scale-options").value = "";
  $("collect-age").checked = true;
  $("collect-gender").checked = true;
  $("gender-options").value = "男性,女性,その他";

  currentImages = [];
  editingProjectId = null;
  currentScaleLabels = [];

  $("editor-title").textContent = "新規プロジェクト";
  $("save-project-button").textContent = "プロジェクトを保存";
  $("image-preview-list").replaceChildren();
  $("image-count").textContent = "選択画像：0枚";

  clearError();
  updateConditionalFields();
  renderQuestionFields([]);
}

function openEditor(projectId = null) {
  resetEditor();

  if (projectId) {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    editingProjectId = project.id;

    $("editor-title").textContent = "プロジェクトを編集";
    $("save-project-button").textContent = "変更を保存";

    $("project-name").value = project.name;
    $("display-count").value = project.displayCount;
    $("display-seconds").value = project.displaySeconds;
    $("blank-enabled").checked = project.blankEnabled;
    $("blank-seconds").value = project.blankSeconds;
    $("rating-enabled").checked = project.ratingEnabled;
    $("question-count").value = project.questions.length || 1;
    $("rating-timing").value = project.ratingTiming;
    $("likert-count").value = project.scaleType;
    currentScaleLabels = Array.isArray(project.scaleLabels)
  ? project.scaleLabels.slice()
  : [];
    $("custom-scale-options").value =
      (project.customScaleOptions || []).join("\n");
    $("collect-age").checked = project.collectAge;
    $("collect-gender").checked = project.collectGender;

    currentImages = project.images.map(image => ({
      name: image.name,
      blob: image.blob
    }));

    renderImagePreviews();

    renderQuestionFields(project.questions);
    updateConditionalFields();
  }

  showScreen("editor-screen");
}


// ========================================
// 画像アップロード・プレビュー
// ========================================

function clearPreviewURLs() {
  previewURLs.forEach(url => URL.revokeObjectURL(url));
  previewURLs = [];
}

function renderImagePreviews() {
  clearPreviewURLs();

  const list = $("image-preview-list");
  list.replaceChildren();

  currentImages.forEach(image => {
    const card = document.createElement("div");
    card.className = "image-preview";

    const img = document.createElement("img");
    const url = URL.createObjectURL(image.blob);
    previewURLs.push(url);
    img.src = url;
    img.alt = image.name;

    const name = document.createElement("p");
    name.textContent = image.name;

    card.append(img, name);
    list.appendChild(card);
  });

  $("image-count").textContent =
    `選択画像：${currentImages.length}枚`;
}

$("image-files").addEventListener("change", event => {
  const files = Array.from(event.target.files || []);

  if (files.length === 0) return;

  const invalid = files.find(file => !file.type.startsWith("image/"));

  if (invalid) {
    showError("画像ファイルを選択してください。");
    event.target.value = "";
    return;
  }

    // 今ある画像を残し、新しく選んだ画像を追加する
  const newImages = files.map(file => ({
    name: file.name,
    blob: file
  }));

  currentImages = currentImages.concat(newImages);

  // 次回、同じファイルを選び直せるようにする
  event.target.value = "";

  clearError();
  renderImagePreviews();
});


// ========================================
// 質問項目の入力欄を生成
// ========================================

function renderQuestionFields(existingQuestions = []) {
  const area = $("question-fields");
  area.replaceChildren();

  if (!$("rating-enabled").checked) return;

  const count = Number($("question-count").value);

  if (!Number.isInteger(count) || count < 1 || count > 50) return;

  for (let i = 0; i < count; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "question-field";

    const heading = document.createElement("h3");
    heading.textContent = `質問 ${i + 1}`;

    const label = document.createElement("label");
    label.htmlFor = `question-${i}`;
    label.textContent = "質問文";

    const input = document.createElement("input");
    input.type = "text";
    input.id = `question-${i}`;
    input.name = `question-${i}`;
    input.placeholder = `質問文 ${i + 1} を入力`;
    input.required = true;
    input.value = existingQuestions[i]?.text || "";

    wrapper.append(heading, label, input);
    area.appendChild(wrapper);
  }
}
// ========================================
// 尺度ラベルの入力欄を生成
// ========================================

function renderScaleLabelFields() {
  const area = $("scale-label-fields");
  area.replaceChildren();

  const scaleType = $("likert-count").value;
  let count;

  if (scaleType === "custom") {
    // 独自尺度は、入力された選択肢の数を使う
    count = $("custom-scale-options").value
      .split("\n")
      .map(option => option.trim())
      .filter(Boolean).length;
  } else {
    // 通常の尺度は、選択された件数を使う
    count = Number(scaleType);
  }

  for (let i = 0; i < count; i++) {
    const wrapper = document.createElement("div");
    wrapper.className = "scale-label-field";

    const label = document.createElement("label");
    label.htmlFor = `scale-label-${i}`;
    label.textContent = `選択肢 ${i + 1} のラベル`;

    const input = document.createElement("input");
    input.type = "text";
    input.id = `scale-label-${i}`;
    input.className = "scale-label-input";
    input.placeholder = `選択肢 ${i + 1} のラベル`;
    input.value = currentScaleLabels[i] ?? "";

    input.addEventListener("input", () => {
      currentScaleLabels = Array.from(
        area.querySelectorAll("input")
      ).map(field => field.value);
    });

    wrapper.append(label, input);
    area.appendChild(wrapper);
  }
}

// ========================================
// 条件に応じた設定欄の表示
// ========================================

function updateConditionalFields() {
  const ratingEnabled = $("rating-enabled").checked;
  const customScale = $("likert-count").value === "custom";

  $("question-count").disabled = !ratingEnabled;
  $("rating-timing").disabled = !ratingEnabled;
  $("likert-count").disabled = !ratingEnabled;

  $("question-fields").classList.toggle("hidden", !ratingEnabled);

  $("custom-scale-area").classList.toggle(
    "hidden",
    !ratingEnabled || !customScale
  );

  $("scale-labels-area").classList.toggle(
    "hidden",
    !ratingEnabled
  );

  $("blank-seconds").disabled = !$("blank-enabled").checked;

  if (ratingEnabled) {
    renderScaleLabelFields();
  } else {
    $("scale-label-fields").replaceChildren();
  }

  if (ratingEnabled) {
    const count = Number($("question-count").value);

    if (Number.isInteger(count) && count >= 1 && count <= 50) {
      const current = Array.from(
        $("question-fields").querySelectorAll("input")
      ).map(input => ({ text: input.value }));

      if (current.length !== count) {
        renderQuestionFields(current);
      }
    }
  }
}

$("rating-enabled").addEventListener("change", updateConditionalFields);
$("blank-enabled").addEventListener("change", updateConditionalFields);

$("likert-count").addEventListener("change", () => {
  updateConditionalFields();
});

$("question-count").addEventListener("input", () => {
  const current = Array.from(
    $("question-fields").querySelectorAll("input")
  ).map(input => ({ text: input.value }));

  renderQuestionFields(current);
});

// 独自尺度の選択肢が変更されたとき、ラベル欄も更新する
$("custom-scale-options").addEventListener("input", () => {
  if (
    $("rating-enabled").checked &&
    $("likert-count").value === "custom"
  ) {
    renderScaleLabelFields();
  }
});
// ========================================
// 設定値の取得・検証
// ========================================

function readProjectSettings() {
  const name = $("project-name").value.trim();
  const displayCount = Number($("display-count").value);
  const displaySeconds = Number($("display-seconds").value);
  const blankEnabled = $("blank-enabled").checked;
  const blankSeconds = Number($("blank-seconds").value);
  const ratingEnabled = $("rating-enabled").checked;

  const questionCount = Number($("question-count").value);
  const scaleType = $("likert-count").value;
  const ratingTiming = $("rating-timing").value;

  const questions = ratingEnabled
    ? Array.from(
        $("question-fields").querySelectorAll("input")
      ).map(input => ({ text: input.value.trim() }))
    : [];

  const customScaleOptions = scaleType === "custom"
    ? $("custom-scale-options").value
        .split("\n")
        .map(option => option.trim())
        .filter(Boolean)
    : [];

  const scaleLabels = Array.from(
    $("scale-label-fields").querySelectorAll("input")
  ).map(input => input.value.trim());
  
  if (!name) throw new Error("プロジェクト名を入力してください。");

  if (currentImages.length < 1) {
    throw new Error("画像ファイルを1枚以上選択してください。");
  }

  if (
    !Number.isInteger(displayCount) ||
    displayCount < 1 ||
    displayCount > currentImages.length
  ) {
    throw new Error(
      "提示枚数は1以上、画像候補数以下にしてください。"
    );
  }

  if (!Number.isFinite(displaySeconds) || displaySeconds <= 0) {
    throw new Error("画像提示時間は0より大きい値にしてください。");
  }

  if (
    blankEnabled &&
    (!Number.isFinite(blankSeconds) || blankSeconds < 0)
  ) {
    throw new Error("ブランク時間は0以上にしてください。");
  }

  if (ratingEnabled) {
    if (
      !Number.isInteger(questionCount) ||
      questionCount < 1 ||
      questionCount > 50
    ) {
      throw new Error("質問項目数は1～50の整数にしてください。");
    }

    if (
      questions.length !== questionCount ||
      questions.some(question => !question.text)
    ) {
      throw new Error("すべての質問文を入力してください。");
    }

    if (scaleType === "custom" && customScaleOptions.length < 2) {
      throw new Error("独自尺度は2つ以上の選択肢を入力してください。");
    }
  }

  return {
    name,
    displayCount,
    displaySeconds,
    blankEnabled,
    blankSeconds: blankEnabled ? blankSeconds : 0,
    ratingEnabled,
    ratingTiming,
    scaleType,
    scaleLabels,
    questions,
    customScaleOptions,
    collectAge: $("collect-age").checked,
    collectGender: $("collect-gender").checked
  };
}


// ========================================
// 保存
// ========================================

$("project-form").addEventListener("submit", async event => {
  event.preventDefault();
  clearError();

  try {
    const settings = readProjectSettings();
    const now = Date.now();

    const existing = editingProjectId
      ? projects.find(p => p.id === editingProjectId)
      : null;

    const project = {
      id: existing?.id || crypto.randomUUID(),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      ...settings,
      images: currentImages.map(image => ({
        name: image.name,
        blob: image.blob
      })),
      responseCount: existing?.responseCount || 0
    };

    await saveProject(project);
    await refreshProjects();

    showScreen("home-screen");
  } catch (error) {
    showError(error.message || "保存できませんでした。");
  }
});


// ========================================
// 詳細画面
// ========================================

function openProjectDetail(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  $("detail-project-name").textContent = project.name;
  $("response-count").textContent = project.responseCount || 0;

  const summary = $("project-summary");
  summary.replaceChildren();

  const rows = [
    `画像候補：${project.images.length}枚`,
    `提示枚数：${project.displayCount}枚`,
    `提示時間：${project.displaySeconds}秒`,
    `ブランク：${project.blankEnabled ? project.blankSeconds + "秒" : "なし"}`,
    `評定：${project.ratingEnabled ? project.questions.length + "項目" : "なし"}`,
    `回答尺度：${project.ratingEnabled ? (project.scaleType === "custom" ? "独自尺度" : project.scaleType + "件法") : "なし"}`,
    `質問タイミング：${project.ratingTiming === "each" ? "画像ごと" : "画像提示後"}`,
    `年齢取得：${project.collectAge ? "あり" : "なし"}`,
    `性別取得：${project.collectGender ? "あり" : "なし"}`
  ];

  rows.forEach(text => {
    const p = document.createElement("p");
    p.textContent = text;
    summary.appendChild(p);
  });

  $("data-status").textContent =
    "オンラインでの回答収集機能は未接続です。";

  $("download-csv-button").disabled = true;
  $("project-action-message").textContent = "";

  $("edit-project-button").onclick = () => openEditor(project.id);

  $("copy-experiment-url-button").onclick = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set("project", project.id);

    try {
      await navigator.clipboard.writeText(url.href);
      $("project-action-message").textContent =
        "URLをコピーしました。ただし参加者用の実験画面はまだ未実装です。";
    } catch {
      $("project-action-message").textContent =
        `URL案：${url.href}（実験画面は次の段階で接続します）`;
    }
  };

  showScreen("detail-screen");
}


// ========================================
// 削除・画面操作
// ========================================

async function removeProject(projectId) {
  const project = projects.find(p => p.id === projectId);
  if (!project) return;

  if (!confirm(`「${project.name}」を削除しますか？`)) return;

  try {
    await deleteProject(projectId);
    await refreshProjects();
  } catch {
    alert("プロジェクトを削除できませんでした。");
  }
}

async function refreshProjects() {
  projects = await getAllProjects();
  renderProjectList();
}

$("new-project-button").addEventListener("click", () => openEditor());

$("cancel-edit-button").addEventListener("click", () => {
  showScreen("home-screen");
});

$("back-to-home-button").addEventListener("click", () => {
  showScreen("home-screen");
});


// ========================================
// 起動
// ========================================

async function initApp() {
  try {
    if (!("indexedDB" in window)) {
      throw new Error("このブラウザではIndexedDBを利用できません。");
    }

    db = await openDatabase();
    await refreshProjects();
    updateConditionalFields();
    showScreen("home-screen");
  } catch (error) {
    showScreen("home-screen");
    $("empty-project-message").textContent =
      "保存領域を初期化できませんでした。ページをHTTPSまたはlocalhostで開いてください。";
    console.error(error);
  }
}

initApp();
