"use strict";

// 試作版：管理画面と同じブラウザのIndexedDBから設定・画像を読み込み、
// 回答をプロジェクト内のresponses配列に保存します。
// 別端末からの参加・中央集約には、後でサーバーAPIへの切り替えが必要です。

const DB_NAME = "ImageExperimentApp";
const STORE_NAME = "projects";
const $ = (id) => document.getElementById(id);

let db;
let project;
let selectedImages = [];
let imageIndex = 0;
let responses = [];
let participantInfo = {};
let currentAnswers = {};
let participantStartedAt = null;
let participantFinishedAt = null;
let finishMessageShown = false;

function showScreen(screenId) {
  [
    "loading-screen",
    "start-screen",
    "participant-screen",
    "experiment-screen",
    "finish-screen",
    "error-screen"
  ].forEach(id => {
    $(id).classList.toggle("hidden", id !== screenId);
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);

    request.onupgradeneeded = () => {
      // 管理画面でまだDBが作られていない場合のための最低限の初期化
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

function getProject(id) {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function saveResponseToProject(response) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(project.id);

    request.onsuccess = () => {
      const latest = request.result;

      if (!latest) {
        transaction.abort();
        reject(new Error("プロジェクトが見つかりません。"));
        return;
      }

      latest.responses = Array.isArray(latest.responses)
        ? latest.responses
        : [];

      latest.responses.push(response);
      latest.responseCount = Number(latest.responseCount || 0) + 1;
      latest.updatedAt = Date.now();

      store.put(latest);
    };

    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => {
      reject(transaction.error || new Error("保存に失敗しました。"));
    };
  });
}

function shuffle(array) {
  const result = array.slice();

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function createStimulusImage(image) {
  const img = document.createElement("img");

  img.className = "experiment-stimulus-image";
  img.alt = image.name || "提示画像";
  img.src = URL.createObjectURL(image.blob);

  img.addEventListener("load", () => {
    // 表示が終わった時点でURLを解放
    window.setTimeout(() => URL.revokeObjectURL(img.src), 0);
  }, { once: true });

  return img;
}

function getScaleOptions() {
  if (project.scaleType === "custom") {
    return (project.customScaleOptions || []).map((text, index) => ({
      value: index + 1,
      label: text,
      scaleLabel: (project.scaleLabels || [])[index] || ""
    }));
  }

  const count = Number(project.scaleType);

    return Array.from({ length: count }, (_, index) => ({
    value: index + 1,
    label: (project.scaleLabels || [])[index] || "",
    scaleLabel: ""
  }));
}

function getOptionText(option) {
  if (project.scaleType === "custom") {
    return option.scaleLabel || option.label || "";
  }

  return option.label || "";
}

function renderRatingQuestions(imageNumber, onComplete) {
  const area = $("rating-area");

  area.replaceChildren();
  $("stimulus-area").replaceChildren();
  $("experiment-controls").classList.remove("hidden");
  $("next-button").textContent = "次へ";

  $("progress-text").textContent = "";

  const form = document.createElement("form");
  form.className = "rating-form";

  project.questions.forEach((question, questionIndex) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "rating-question";

    const legend = document.createElement("legend");
    legend.textContent = question.text;

    fieldset.appendChild(legend);

    const options = getScaleOptions();
    const optionsContainer = document.createElement("div");
    optionsContainer.className = "rating-options";

    options.forEach(option => {
      const label = document.createElement("label");
      label.className = "rating-option";
      
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `question-${questionIndex}`;
      input.value = String(option.value);
      input.required = true;
      
      const number = document.createElement("span");
      number.className = "rating-number";
      number.textContent = String(option.value);
      
      const text = document.createElement("span");
      text.className = "rating-label-text";
      text.textContent = getOptionText(option);
      
      label.append(input, number, text);
      optionsContainer.appendChild(label);
    });

    fieldset.appendChild(optionsContainer);
    form.appendChild(fieldset);
  });

  area.appendChild(form);

  $("next-button").onclick = () => {
    if (!form.reportValidity()) return;

    const answers = {};

    project.questions.forEach((question, questionIndex) => {
      const selected = form.querySelector(
        `input[name="question-${questionIndex}"]:checked`
      );

      answers[`question_${questionIndex + 1}`] =
        Number(selected.value);
    });

    onComplete(answers);
  };
}

function setupParticipantForm() {
  const collectAge = Boolean(project.collectAge);
  const collectGender = Boolean(project.collectGender);

  $("participant-age-field").classList.toggle(
    "hidden",
    !collectAge
  );

  $("participant-gender-field").classList.toggle(
    "hidden",
    !collectGender
  );

  $("participant-age").required = collectAge;
  $("participant-gender").required = collectGender;

  const genderSelect = $("participant-gender");
  genderSelect.replaceChildren();

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "選択してください";
  genderSelect.appendChild(placeholder);

  const genderOptions = Array.isArray(project.genderOptions)
    ? project.genderOptions
    : ["男性", "女性", "その他"];

  genderOptions.forEach(gender => {
    const option = document.createElement("option");
    option.value = gender;
    option.textContent = gender;
    genderSelect.appendChild(option);
  });
}

async function showBlankIfNeeded() {
  if (
    project.blankEnabled &&
    Number(project.blankSeconds) > 0
  ) {
    $("stimulus-area").replaceChildren();
    $("rating-area").replaceChildren();
    $("experiment-controls").classList.add("hidden");
    $("progress-text").textContent = "";

    await wait(Number(project.blankSeconds) * 1000);
  }
}

async function showImage(index) {
  imageIndex = index;

  $("rating-area").replaceChildren();
  $("experiment-controls").classList.add("hidden");

  $("progress-text").textContent = "";
  
  const area = $("stimulus-area");
  area.replaceChildren();

  const image = selectedImages[index];
  area.appendChild(createStimulusImage(image));

  await wait(Number(project.displaySeconds) * 1000);

  // 画像の提示時間が終わったら画像を隠す
  area.replaceChildren();

  if (
    project.ratingEnabled &&
    project.ratingTiming === "each"
  ) {
    renderRatingQuestions(index, answers => {
      responses.push({
        imageIndex: index + 1,
        imageName: image.name,
        answers,
        answeredAt: new Date().toISOString()
      });

      currentAnswers = {};
      continueAfterImage(index);
    });

    return;
  }

  await continueAfterImage(index);
}

async function continueAfterImage(index) {
  await showBlankIfNeeded();

  if (index + 1 < selectedImages.length) {
    await showImage(index + 1);
    return;
  }

  if (
    project.ratingEnabled &&
    project.ratingTiming !== "each"
  ) {
    renderRatingQuestions(0, answers => {
      responses.push({
        imageIndex: null,
        imageName: null,
        answers,
        answeredAt: new Date().toISOString()
      });

      completeExperiment();
    });

    return;
  }

  completeExperiment();
}

async function startExperiment() {
  participantStartedAt = new Date().toISOString();
  responses = [];
  currentAnswers = {};

  selectedImages = shuffle(project.images).slice(
    0,
    Number(project.displayCount)
  );

  if (
    selectedImages.length !== Number(project.displayCount)
  ) {
    showError(
      "提示する画像が不足しています。管理画面で設定を確認してください。"
    );

    return;
  }

  showScreen("experiment-screen");
  await showImage(0);
}

async function completeExperiment() {
  if (finishMessageShown) return;

  finishMessageShown = true;
  participantFinishedAt = new Date().toISOString();

  const responseRecord = {
    responseId: (
      crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`
    ),
    projectId: project.id,
    projectName: project.name,
    startedAt: participantStartedAt,
    finishedAt: participantFinishedAt,

    age: participantInfo.age ?? null,
    gender: participantInfo.gender ?? null,

    imageOrder: selectedImages.map(image => image.name),
    responses: responses
  };

  try {
    await saveResponseToProject(responseRecord);

    $("finish-note").textContent = "回答を保存しました。";
  } catch (error) {
    console.error(error);

    $("finish-note").textContent =
      "このブラウザに回答を保存できませんでした。実験担当者にお知らせください。";
  }

  showScreen("finish-screen");
}

function showError(message) {
  $("error-message").textContent = message;
  showScreen("error-screen");
}

async function initExperiment() {
  try {
    const projectId = new URLSearchParams(
      window.location.search
    ).get("project");

    if (!projectId) {
      showError(
        "実験URLにプロジェクトIDがありません。管理画面から実験URLを取得してください。"
      );

      return;
    }

    db = await openDatabase();
    project = await getProject(projectId);

    if (!project) {
      showError(
        "このブラウザに実験設定が見つかりません。管理画面と同じブラウザで開くか、設定を確認してください。"
      );

      return;
    }

    if (
      !Array.isArray(project.images) ||
      project.images.length === 0
    ) {
      showError("提示画像が登録されていません。");
      return;
    }

    if (
      Number(project.displayCount) < 1 ||
      Number(project.displayCount) > project.images.length
    ) {
      showError(
        "提示枚数の設定が不正です。管理画面で確認してください。"
      );

      return;
    }

    setupParticipantForm();

    $("start-button").addEventListener("click", () => {
      if (project.collectAge || project.collectGender) {
        showScreen("participant-screen");
      } else {
        participantInfo = {};
        startExperiment();
      }
    });
    
    $("participant-form").addEventListener("submit", event => {
      event.preventDefault();
    
      const ageInput = $("participant-age").value;
      const genderInput = $("participant-gender").value;
    
      if (
        project.collectAge &&
        (
          ageInput === "" ||
          !Number.isInteger(Number(ageInput)) ||
          Number(ageInput) < 0 ||
          Number(ageInput) > 120
        )
      ) {
        $("participant-age").reportValidity();
        return;
      }
    
      participantInfo = {
        age: project.collectAge ? Number(ageInput) : null,
        gender: project.collectGender ? genderInput : null
      };
    
      startExperiment();
    });

    $("finish-button").addEventListener("click", () => {
      // window.close() は、スクリプトから開かれたタブ以外では
      // ブラウザに拒否されることがあります。
      window.close();

      $("finish-note").textContent =
        "このタブは自動で閉じられない場合があります。閉じない場合は、タブを閉じてください。";
    });

    showScreen("start-screen");
  } catch (error) {
    console.error(error);

    showError(
      "実験設定を読み込めませんでした。ページを再読み込みしてください。"
    );
  }
}

initExperiment();
