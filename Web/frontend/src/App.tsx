import { useEffect, useState } from 'react'

function App() {
  const [activePage, setActivePage] = useState<'explorer' | 'hasher'>('explorer')
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
  const [fileResult, setFileResult] = useState<{ filename: string, uuid: string, size?: number } | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{ sha256: string, letterCount: number, wordCount: number } | null>(null)
  let socketRef = { current: null as WebSocket | null };
  let errorTriggeredRef = { current: false };

  function showErrorOverlay(message: string, download: boolean = false) {
    const errorMessage = document.getElementById("errorMessage");
    const errorOverlay = document.getElementById("errorOverlay");
    if (errorMessage && errorOverlay) {
      errorMessage.textContent = message;
      errorOverlay.style.display = "flex";
    }
    if (download) {
      const errorIcon = document.getElementById("errorIcon");
      if (errorIcon) errorIcon.textContent = "📥";
      const installButton = document.createElement("button");
      installButton.textContent = "Install Daemon";
      installButton.className = "mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors";
      installButton.onclick = () => {
        window.open("https://github.com/Lessyzz/Microservice-App/releases/download/Daemon/daemon.zip");
      };
      const errorInside = document.getElementById("errorOverlay-inside");
      if (errorInside) {
        errorInside.appendChild(installButton);
      }
    }
  }

  let currentPathRef = { current: "C:\\" };
  let pathHistoryRef = { current: [] as string[] };
  let viewingFileRef = { current: false };

  function listDirectory(path: string) {
    socketRef.current?.send(JSON.stringify({ command: "list", path }));
    const fileContent = document.getElementById("fileContent");
    if (fileContent) fileContent.textContent = "";
  }

  function readFile(path: string) {
    socketRef.current?.send(JSON.stringify({ command: "read", path }));
  }

  function goBack() {
    if (viewingFileRef.current) {
      viewingFileRef.current = false;
      const fileContent = document.getElementById("fileContent");
      if (fileContent) fileContent.textContent = "";
      listDirectory(currentPathRef.current);
    } else if (pathHistoryRef.current.length > 0) {
      currentPathRef.current = pathHistoryRef.current.pop()!;
      listDirectory(currentPathRef.current);
    } else {
      alert("🚫 No previous folder in history.");
    }
  }

  function getResult(uuid: string) {
    const _getResult = () => {
      fetch(`http://localhost:1001/result/${uuid}`)
        .then(response => {
          if (response.ok) {
            return response.json();
          }
          throw new Error('Result not ready');
        })
        .then(data => {
          if (data.completed) {
            console.log("Analysis result:", data);
            const results = {
              ...data.results,
              wordCount: parseInt(data.results.wordCount, 10),
              letterCount: parseInt(data.results.letterCount, 10),
            };
            setAnalysisResult(results);
            setTimeout(() => {
              setIsAnalyzing(false);
            }, 100);
          } else {
            setTimeout(_getResult, 3000);
          }
        })
        .catch(() => {
          setTimeout(_getResult, 3000);
        });
    };

    setIsAnalyzing(true);
    _getResult();
  }

  useEffect(() => {
    if (activePage !== 'explorer') return;

    // DOM manipülasyonlarını temizle
    const cleanup = () => {
      const fileList = document.getElementById("fileList");
      const fileContent = document.getElementById("fileContent");
      if (fileList) fileList.innerHTML = "";
      if (fileContent) fileContent.textContent = "";
    };

    errorTriggeredRef.current = false;
    socketRef.current = new window.WebSocket("ws://localhost:8080/");

    socketRef.current.onerror = () => {
      errorTriggeredRef.current = true;
      showErrorOverlay(
        "Daemon is not running. Please start the daemon to use the file explorer.\nIf you did not install the daemon, please click the button below to install it.", true
      );
    };

    socketRef.current.onclose = (event) => {
      if (!event.wasClean && !errorTriggeredRef.current) {
        showErrorOverlay(
          "Daemon closed unexpectedly. Please ensure the daemon is running."
        );
      }
    };

    socketRef.current.onopen = () => {
      errorTriggeredRef.current = false;
      listDirectory(currentPathRef.current);
    };

    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      const fileList = document.getElementById("fileList");
      const fileContent = document.getElementById("fileContent");
      if (!fileList || !fileContent) return;
      fileList.innerHTML = "";
      fileContent.textContent = "";

      if (data.directories || data.files) {
        viewingFileRef.current = false;
        const pathElem = document.getElementById("path");
        if (pathElem) pathElem.textContent = currentPathRef.current;

        (data.directories || []).forEach((dir: string) => {
          const li = document.createElement("li");
          li.innerHTML = `<div class="flex items-center p-3 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors border border-gray-200 mb-2">
            <span class="text-2xl mr-3">📁</span>
            <span class="text-gray-800 font-medium">${dir}</span>
          </div>`;
          li.onclick = () => {
            pathHistoryRef.current.push(currentPathRef.current);
            currentPathRef.current +=
              (currentPathRef.current.endsWith("\\") ? "" : "\\") + dir;
            listDirectory(currentPathRef.current);
          };
          fileList.appendChild(li);
        });

        (data.files || []).forEach((file: string) => {
          const li = document.createElement("li");
          li.innerHTML = `<div class="flex items-center p-3 hover:bg-blue-50 cursor-pointer rounded-lg transition-colors border border-gray-200 mb-2">
            <span class="text-2xl mr-3">📄</span>
            <span class="text-gray-800 font-medium">${file}</span>
          </div>`;
          li.onclick = () => {
            viewingFileRef.current = true;
            readFile(currentPathRef.current + "\\" + file);
          };
          fileList.appendChild(li);
        });
      } else if (data.content) {
        fileContent.textContent =
          "📄 " + data.fileName + ":\n\n" + data.content;
        fileList.innerHTML = "";
      } else if (data.error) {
        alert("❌ Error: " + data.error);
      }
    };

    return () => {
      cleanup();
      socketRef.current?.close();
    };
  }, [activePage]);

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus('uploading');
    setFileResult(null);
    setAnalysisResult(null);
    setIsAnalyzing(false);

    const formData = new FormData();
    formData.append("file", file);

    fetch("http://localhost:1001/upload", {
      method: "POST",
      body: formData,
    })
      .then(response => response.json())
      .then(data => {
        setUploadStatus('success');
        const result = {
          filename: data.filename || file.name,
          uuid: data.uuid,
          size: file.size
        };
        setFileResult(result);
        setIsAnalyzing(true);
        setTimeout(() => {
          getResult(result.uuid);
        }, 2000);
      })
      .catch(error => {
        console.error("Error:", error);
        setUploadStatus('error');
      });
  }

  function resetUpload() {
    setUploadStatus('idle');
    setFileResult(null);
    setIsAnalyzing(false);
    setAnalysisResult(null);
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Analyzing Overlay */}
      {isAnalyzing && (
        <div className="fixed inset-0 bg-black-950 bg-opacity-100 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 shadow-2xl flex flex-col items-center max-w-sm mx-4">
            <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-6"></div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">Analyzing File</h3>
            <p className="text-gray-600 text-center">Please wait while we process your file...</p>
          </div>
        </div>
      )}

      <div className="container mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">File Management Suite</h1>
          <p className="text-gray-600">Explore files and analyze documents with advanced hashing</p>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-1 mb-8 bg-gray-200 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActivePage('explorer')}
            className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2 ${activePage === 'explorer'
              ? 'bg-white text-blue-600 shadow-md'
              : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <span className="text-lg">📁</span>
            <span>File Explorer</span>
          </button>
          <button
            onClick={() => setActivePage('hasher')}
            className={`px-6 py-3 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2 ${activePage === 'hasher'
              ? 'bg-white text-blue-600 shadow-md'
              : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <span className="text-lg">🔐</span>
            <span>File Analyzer</span>
          </button>
        </div>

        {/* Explorer Page */}
        {activePage === 'explorer' && (
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-semibold text-gray-800 flex items-center">
                <span className="text-2xl mr-3">📁</span>
                File Explorer
              </h2>
              <button
                onClick={goBack}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center space-x-2"
              >
                <span>⬅️</span>
                <span>Back</span>
              </button>
            </div>

            <div className="mb-6 p-3 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-600">Current Path:</span>
              <span id="path" className="ml-2 font-mono text-gray-800">C:\</span>
            </div>

            <div id="fileList" className="space-y-2"></div>
            <pre id="fileContent" className="mt-6 p-4 bg-gray-50 rounded-lg text-sm font-mono overflow-auto max-h-96"></pre>
          </div>
        )}

        {/* Hasher Page */}
        {activePage === 'hasher' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center">
                <span className="text-2xl mr-3">🔐</span>
                File Analyzer
              </h2>

              {/* File Upload Section */}
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-blue-400 transition-colors">
                <div className="space-y-4">
                  <div className="text-4xl">📤</div>
                  <div>
                    <input
                      type="file"
                      onChange={handleFileUpload}
                      disabled={uploadStatus === 'uploading'}
                      className="hidden"
                      id="fileInput"
                    />
                    <label
                      htmlFor="fileInput"
                      className={`inline-block px-6 py-3 rounded-lg font-medium transition-colors cursor-pointer ${uploadStatus === 'uploading'
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                    >
                      {uploadStatus === 'uploading' ? 'Uploading...' : 'Choose File to Analyze'}
                    </label>
                  </div>
                  <p className="text-gray-500 text-sm">Select a file to get SHA256 hash and content analysis</p>
                </div>
              </div>

              {uploadStatus !== 'idle' && (
                <div className="mt-4">
                  <button
                    onClick={resetUpload}
                    disabled={uploadStatus === 'uploading'}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    🔄 Upload New File
                  </button>
                </div>
              )}

              {/* Upload Status Messages */}
              {uploadStatus === 'uploading' && (
                <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg">
                  <div className="flex items-center">
                    <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-3"></div>
                    <span className="text-blue-800 font-medium">File uploading and processing...</span>
                  </div>
                </div>
              )}

              {uploadStatus === 'error' && (
                <div className="mt-6 p-4 bg-red-50 border-l-4 border-red-400 rounded-lg">
                  <span className="text-red-800 font-medium">❌ Error occurred while uploading file!</span>
                </div>
              )}
            </div>

            {/* Results Section */}
            {uploadStatus === 'success' && fileResult && (
              <div className="bg-white rounded-2xl shadow-lg p-6">
                <div className="flex items-center mb-6">
                  <span className="text-2xl mr-3">✅</span>
                  <h3 className="text-xl font-semibold text-green-600">File Processed Successfully</h3>
                </div>

                {/* File Info */}
                <div className="bg-gray-50 rounded-xl p-6 mb-6">
                  <h4 className="font-semibold text-gray-800 mb-4 flex items-center">
                    <span className="text-lg mr-2">📄</span>
                    File Information
                  </h4>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-mono text-gray-800 bg-white px-3 py-1 rounded">{fileResult.filename}</span>
                    </div>
                    {fileResult.size && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600">Size:</span>
                        <span className="font-mono text-gray-800 bg-white px-3 py-1 rounded">{formatFileSize(fileResult.size)}</span>
                      </div>
                    )}
                    {/* <div className="flex justify-between items-start">
                      <span className="text-gray-600">UUID:</span>
                      <code className="bg-white p-2 rounded text-xs font-mono text-gray-800 max-w-xs break-all">
                        {fileResult.uuid}
                      </code>
                    </div> */}
                  </div>
                </div>

                {/* Analysis Results */}
                {analysisResult && (
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-xl p-6">
                    <h4 className="font-semibold text-gray-800 mb-6 flex items-center">
                      <span className="text-lg mr-2">📊</span>
                      Analysis Results
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* SHA256 Hash */}
                      <div className="bg-white rounded-lg p-4 shadow-sm">
                        <div className="flex items-center mb-3">
                          <span className="text-xl mr-2">🔐</span>
                          <span className="font-semibold text-gray-700">SHA256 Hash</span>
                        </div>
                        <code className="text-xs font-mono text-gray-600 break-all bg-gray-50 p-2 rounded block">
                          {analysisResult.sha256}
                        </code>
                      </div>

                      {/* Letter Count */}
                      {typeof analysisResult.letterCount === 'number' && (
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                          <div className="flex items-center mb-3">
                            <span className="text-xl mr-2">🔤</span>
                            <span className="font-semibold text-gray-700">Letter Count</span>
                          </div>
                          <div className="text-2xl font-bold text-blue-600">
                            {analysisResult.letterCount.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {/* Word Count */}
                      {typeof analysisResult.wordCount === 'number' && (
                        <div className="bg-white rounded-lg p-4 shadow-sm">
                          <div className="flex items-center mb-3">
                            <span className="text-xl mr-2">📝</span>
                            <span className="font-semibold text-gray-700">Word Count</span>
                          </div>
                          <div className="text-2xl font-bold text-green-600">
                            {analysisResult.wordCount.toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error Overlay */}
      <div id="errorOverlay" className="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center z-50">
        <div id="errorOverlay-inside" className="bg-white rounded-2xl p-8 shadow-2xl max-w-md mx-4 text-center">
          <span id="errorIcon" className="text-4xl block mb-4">❌</span>
          <div id="errorMessage" className="text-gray-800 mb-4"></div>
        </div>
      </div>
    </div>
  )
}

export default App