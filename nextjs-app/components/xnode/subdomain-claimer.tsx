import { getBaseUrl } from "@/lib/xnode";
import { xnode } from "@openmesh-network/xnode-manager-sdk";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import axios from "axios";
import {
  awaitRequest,
  useOsSet,
} from "@openmesh-network/xnode-manager-sdk-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LoginXnode, LoginXnodeParams } from "./login";
import { useSetSettings, useSettings, Xnode } from "../context/settings";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAddress } from "@/hooks/useAddress";

export function SubdomainClaimer({
  session,
  xnode,
  setBusy,
}: {
  session?: xnode.utils.Session;
  xnode?: Xnode;
  setBusy: (busy: boolean) => void;
}) {
  const address = useAddress();
  const settings = useSettings();
  const setSettings = useSetSettings();

  const { push } = useRouter();
  const { mutateAsync: set } = useOsSet();

  const [login, setLogin] = useState<LoginXnodeParams | undefined>(undefined);
  const [subdomain, setSubdomain] = useState<string>("");

  const { data: subdomainAvailable } = useQuery({
    queryKey: ["subdomainAvailable", subdomain],
    enabled: !!subdomain,
    queryFn: async () => {
      if (
        !new RegExp(/^[A-Za-z0-9](?:[A-Za-z0-9\-]{0,61}[A-Za-z0-9])?$/).test(
          subdomain
        )
      ) {
        return false;
      }

      return axios
        .get(`https://claim.dns.openmesh.network/${subdomain}/available`)
        .then((res) => res.data as boolean);
    },
  });

  return (
    <>
      {xnode && !xnode.secure && session && address && (
        <Alert className="bg-[#0c2246d6] text-white">
          <AlertTitle>Free openmesh.cloud subdomain available!</AlertTitle>
          <AlertDescription className="text-white/80">
            <span>
              You can claim a free openmesh.cloud subdomain for your Xnode
              usage, allowing for full zero trust management (end-to-end
              encryption). You can always import the Xnode by IP address in case
              you experience any access issues through the domain.
            </span>
            <div className="pt-1 flex gap-2 flex-wrap">
              <div className="flex gap-2">
                <Label htmlFor="xnode-subdomain">Subdomain</Label>
                <Input
                  id="xnode-subdomain"
                  className={cn(
                    "min-w-40",
                    subdomainAvailable === false
                      ? "border-red-600"
                      : subdomainAvailable === true
                      ? "border-green-500"
                      : ""
                  )}
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value)}
                />
              </div>
              <Button
                onClick={() => {
                  const sanitizedSubdomain = subdomain
                    .replace(".openmesh.cloud", "")
                    .trim();
                  const domain = `manager.${sanitizedSubdomain}.openmesh.cloud`;
                  const messageTimestamp = Math.round(Date.now() / 1000);
                  setLogin({
                    message: `Xnode Auth authenticate ${domain} at ${messageTimestamp}`,
                    onSigned(signature) {
                      setLogin(undefined);
                      setBusy(true);
                      axios
                        .post(
                          `https://claim.dns.openmesh.network/${subdomain}/reserve`,
                          {
                            user: address,
                            ipv4: xnode.insecure,
                          }
                        )
                        .then(() =>
                          set({
                            session,
                            data: {
                              domain,
                              acme_email: "samuel.mens@openmesh.network",
                              flake: null,
                              update_inputs: null,
                              user_passwd: null,
                              xnode_owner: null,
                            },
                          })
                        )
                        .then(({ request_id }) =>
                          awaitRequest({
                            request: {
                              session,
                              path: { request_id },
                            },
                          })
                        )
                        .then(() => {
                          const newXnode = {
                            ...xnode,
                            secure: domain,
                            loginArgs: {
                              ...xnode.loginArgs,
                              signature,
                              timestamp: messageTimestamp.toString(),
                            },
                          };
                          setSettings({
                            ...settings,
                            xnodes: settings.xnodes.map((x) => {
                              if (x === xnode) {
                                return newXnode;
                              }

                              return x;
                            }),
                          });
                          push(
                            `/xnode?baseUrl=${getBaseUrl({
                              xnode: newXnode,
                            })}`
                          );
                        })
                        .finally(() => setBusy(false));
                    },
                    onCancel() {
                      setLogin(undefined);
                    },
                  });
                }}
                disabled={!subdomainAvailable}
              >
                Claim
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      {login && <LoginXnode {...login} />}
    </>
  );
}
