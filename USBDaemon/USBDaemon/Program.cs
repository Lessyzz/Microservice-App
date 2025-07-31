using System.Net;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

HttpListener httpListener = new HttpListener();
httpListener.Prefixes.Add("http://localhost:8080/");
httpListener.Start();
Console.WriteLine("🔌 WebSocket server started at ws://localhost:8080/");

while (true)
{
    var context = await httpListener.GetContextAsync();

    if (context.Request.IsWebSocketRequest)
    {
        Console.WriteLine("🔗 WebSocket connection received.");
        var wsContext = await context.AcceptWebSocketAsync(null);
        var socket = wsContext.WebSocket;

        var buffer = new byte[4096];

        while (socket.State == WebSocketState.Open)
        {
            try
            {
                var receivedData = new List<byte>();
                WebSocketReceiveResult result;

                do
                {
                    result = await socket.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                    receivedData.AddRange(buffer.AsSpan(0, result.Count).ToArray());
                }
                while (!result.EndOfMessage);

                string message = Encoding.UTF8.GetString(receivedData.ToArray());

                if (string.IsNullOrWhiteSpace(message))
                {
                    // Skip empty messages
                    continue;
                }

                Console.WriteLine("📥 Received complete message: " + message);

                // Deserialize JSON command
                var data = JsonSerializer.Deserialize<Dictionary<string, string>>(message);
                if (data == null || !data.ContainsKey("command") || !data.ContainsKey("path"))
                {
                    throw new Exception("Invalid command format");
                }

                string command = data["command"];
                string path = data["path"];
                string responseJson = "";

                if (command == "list")
                {
                    if (Directory.Exists(path))
                    {
                        var directories = Directory.GetDirectories(path)
                            .Select(System.IO.Path.GetFileName)
                            .ToList();

                        var files = Directory.GetFiles(path)
                            .Select(System.IO.Path.GetFileName)
                            .ToList();

                        responseJson = JsonSerializer.Serialize(new
                        {
                            directories,
                            files
                        });
                    }
                    else
                    {
                        responseJson = JsonSerializer.Serialize(new { error = "Directory not found." });
                    }
                }
                else if (command == "read")
                {
                    if (File.Exists(path))
                    {
                        string content = File.ReadAllText(path);
                        responseJson = JsonSerializer.Serialize(new
                        {
                            fileName = System.IO.Path.GetFileName(path),
                            content
                        });
                    }
                    else
                    {
                        responseJson = JsonSerializer.Serialize(new { error = "File not found." });
                    }
                }
                else
                {
                    responseJson = JsonSerializer.Serialize(new { error = "Invalid command." });
                }

                byte[] responseBuffer = Encoding.UTF8.GetBytes(responseJson);
                await socket.SendAsync(new ArraySegment<byte>(responseBuffer), WebSocketMessageType.Text, true, CancellationToken.None);
            }
            catch (Exception ex)
            {
                Console.WriteLine("❌ Error: " + ex.Message);
                try
                {
                    string errorJson = JsonSerializer.Serialize(new { error = "An error occurred." });
                    byte[] errorBuffer = Encoding.UTF8.GetBytes(errorJson);
                    await socket.SendAsync(new ArraySegment<byte>(errorBuffer), WebSocketMessageType.Text, true, CancellationToken.None);
                }
                catch { }
            }
        }

        Console.WriteLine("❌ Connection closed.");
        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "Closed", CancellationToken.None);
    }
    else
    {
        context.Response.StatusCode = 400;
        context.Response.Close();
        Console.WriteLine("❗ Non-WebSocket request rejected.");
    }
}
