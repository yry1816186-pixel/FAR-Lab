# EEL remote-execution SSH target (D-084). A REAL Linux SSH boundary: key-only auth,
# no ambient trust. Not a security sandbox (same-host container — environment boundary).
FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssh-server python3 python3-sklearn \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /run/sshd /root/.ssh \
  && sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config \
  && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config

# Root password locked; access is exclusively via the injected authorized key.
EXPOSE 22
CMD ["/usr/sbin/sshd", "-D", "-e"]
