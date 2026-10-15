#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

static void respond(int fd, int code, const char *reason, const char *body) {
  char hdr[256];
  int blen = (int)strlen(body);
  int n = snprintf(hdr, sizeof(hdr),
                   "HTTP/1.1 %d %s\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: close\r\n\r\n",
                   code, reason, blen);
  if (n > 0) {
    (void)write(fd, hdr, (size_t)n);
    (void)write(fd, body, (size_t)blen);
  }
}

static int field(const char *body, const char *key, int *out) {
  char pat[32];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char *p = strstr(body, pat);
  if (!p) return -1;
  p += strlen(pat);
  while (*p == ' ' || *p == '\t' || *p == ':') p++;
  if (*p != '-' && !isdigit((unsigned char)*p)) return -1;
  *out = atoi(p);
  return 0;
}

static int run_script(const char *script) {
  int pipefd[2];
  if (pipe(pipefd) != 0) return -1;
  pid_t pid = fork();
  if (pid < 0) {
    close(pipefd[0]);
    close(pipefd[1]);
    return -1;
  }
  if (pid == 0) {
    dup2(pipefd[1], STDOUT_FILENO);
    close(pipefd[0]);
    close(pipefd[1]);
    int devnull = open("/dev/null", O_RDONLY);
    if (devnull >= 0) {
      dup2(devnull, STDIN_FILENO);
      close(devnull);
    }
    execl("/usr/bin/osascript", "osascript", "-e", script, (char *)NULL);
    _exit(127);
  }
  close(pipefd[1]);
  int status = 0;
  int done = 0;
  for (int i = 0; i < 20; i++) {
    if (waitpid(pid, &status, WNOHANG) == pid) {
      done = 1;
      break;
    }
    usleep(100000);
  }
  if (!done) {
    kill(pid, SIGKILL);
    waitpid(pid, &status, 0);
    close(pipefd[0]);
    return -1;
  }
  char out[64];
  memset(out, 0, sizeof(out));
  (void)read(pipefd[0], out, sizeof(out) - 1);
  close(pipefd[0]);
  return strstr(out, "ok") != NULL ? 1 : 0;
}

static int restack_by_id(int window_id, int quiet_id) {
  char script[1024];
  (void)quiet_id;
  if (window_id <= 0) return 0;
  snprintf(script, sizeof(script),
           "tell application \"Microsoft Edge\"\n"
           "try\n"
           "set index of window id %d to 1\n"
           "return \"ok\"\n"
           "end try\n"
           "return \"miss\"\n"
           "end tell\n",
           window_id);
  return run_script(script);
}

static int stage_quiet(int user_id, int quiet_id, int left, int top, int width, int height) {
  char script[2048];
  int right;
  int bottom;
  if (user_id <= 0 || quiet_id <= 0 || user_id == quiet_id) return 0;
  if (width < 200 || height < 150 || width > 8000 || height > 8000) return 0;
  right = left + width;
  bottom = top + height;
  // Raise the user window before and after the bounds change. Setting bounds
  // can order the quiet window above the page being read; never set the quiet
  // window index, because a low index raises that blank window.
  snprintf(script, sizeof(script),
           "tell application \"Microsoft Edge\"\n"
           "try\n"
           "set index of window id %d to 1\n"
           "set bounds of window id %d to {%d, %d, %d, %d}\n"
           "set index of window id %d to 1\n"
           "delay 0.05\n"
           "set index of window id %d to 1\n"
           "return \"ok\"\n"
           "end try\n"
           "return \"miss\"\n"
           "end tell\n",
           user_id, quiet_id, left, top, right, bottom, user_id, user_id);
  return run_script(script);
}

static int restack_by_bounds(int left, int top, int width, int height) {
  char script[2048];
  int right = left + width;
  int bottom = top + height;
  snprintf(script, sizeof(script),
           "tell application \"Microsoft Edge\"\n"
           "set moved to false\n"
           "repeat with w in windows\n"
           "try\n"
           "set b to bounds of w\n"
           "set nearLeft to (item 1 of b) ≥ %d and (item 1 of b) ≤ %d\n"
           "set nearTop to (item 2 of b) ≥ %d and (item 2 of b) ≤ %d\n"
           "set nearRight to (item 3 of b) ≥ %d and (item 3 of b) ≤ %d\n"
           "set nearBottom to (item 4 of b) ≥ %d and (item 4 of b) ≤ %d\n"
           "if nearLeft and nearTop and nearRight and nearBottom then\n"
           "set index of w to 1\n"
           "set moved to true\n"
           "end if\n"
           "end try\n"
           "end repeat\n"
           "if moved then return \"ok\"\n"
           "return \"miss\"\n"
           "end tell\n",
           left - 8, left + 8, top - 8, top + 8, right - 12, right + 12, bottom - 12, bottom + 12);
  return run_script(script);
}

int main(void) {
  signal(SIGPIPE, SIG_IGN);
  int server = socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) return 1;
  int opt = 1;
  setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
  struct sockaddr_in addr;
  memset(&addr, 0, sizeof(addr));
  addr.sin_family = AF_INET;
  addr.sin_port = htons(17991);
  inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr);
  if (bind(server, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
    perror("bind");
    return 1;
  }
  if (listen(server, 4) != 0) return 1;
  char buf[8192];
  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;
    struct timeval tv;
    tv.tv_sec = 2;
    tv.tv_usec = 0;
    setsockopt(client, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));
    int n = 0;
    while (n < (int)sizeof(buf) - 1) {
      ssize_t r = read(client, buf + n, sizeof(buf) - 1 - n);
      if (r <= 0) break;
      n += (int)r;
      buf[n] = 0;
      if (strstr(buf, "\r\n\r\n")) break;
    }
    buf[n] = 0;
    int is_restack = strncmp(buf, "POST /restack ", 14) == 0;
    int is_stage = strncmp(buf, "POST /stage ", 12) == 0;
    if (!is_restack && !is_stage) {
      respond(client, 404, "Not Found", "{\"ok\":false,\"status\":\"not_found\"}");
      close(client);
      continue;
    }
    char *split = strstr(buf, "\r\n\r\n");
    if (!split) {
      respond(client, 400, "Bad Request", "{\"ok\":false,\"status\":\"bad_request\"}");
      close(client);
      continue;
    }
    char *body = split + 4;
    int have = n - (int)(body - buf);
    const char *cl = strstr(buf, "Content-Length:");
    int length = cl ? atoi(cl + 15) : have;
    if (length < 1 || length > 4096) {
      respond(client, 400, "Bad Request", "{\"ok\":false,\"status\":\"bad_length\"}");
      close(client);
      continue;
    }
    while (have < length && n < (int)sizeof(buf) - 1) {
      ssize_t r = read(client, buf + n, (size_t)(length - have));
      if (r <= 0) break;
      n += (int)r;
      have += (int)r;
    }
    if (have < length) {
      respond(client, 400, "Bad Request", "{\"ok\":false,\"status\":\"short_body\"}");
      close(client);
      continue;
    }
    body[length] = 0;
    int left = 0, top = 0, width = 0, height = 0;
    int window_id = 0, quiet_id = 0, user_id = 0;
    int has_window = field(body, "window_id", &window_id) == 0;
    int has_quiet = field(body, "quiet_id", &quiet_id) == 0;
    int has_user = field(body, "user_id", &user_id) == 0;
    int has_bounds = field(body, "left", &left) == 0 && field(body, "top", &top) == 0
      && field(body, "width", &width) == 0 && field(body, "height", &height) == 0;
    int rc = -1;
    if (is_stage) {
      if (!has_user || !has_quiet || !has_bounds || user_id == quiet_id) {
        respond(client, 400, "Bad Request", "{\"ok\":false,\"status\":\"bad_stage\"}");
        close(client);
        continue;
      }
      rc = stage_quiet(user_id, quiet_id, left, top, width, height);
    } else if (has_window) {
      rc = restack_by_id(window_id, has_quiet ? quiet_id : 0);
    } else {
      if (!has_bounds || width < 800 || height < 500) {
        respond(client, 400, "Bad Request", "{\"ok\":false,\"status\":\"too_small\"}");
        close(client);
        continue;
      }
      rc = restack_by_bounds(left, top, width, height);
    }
    if (rc == 1) respond(client, 200, "OK", "{\"ok\":true,\"status\":\"ok\"}");
    else if (rc == 0) respond(client, 200, "OK", "{\"ok\":false,\"status\":\"miss\"}");
    else respond(client, 200, "OK", "{\"ok\":false,\"status\":\"error\"}");
    close(client);
  }
}
