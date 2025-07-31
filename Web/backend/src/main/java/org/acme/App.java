package org.acme;

import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.jboss.resteasy.reactive.multipart.FileUpload;
import org.acme.Managers.RequestManager;
import org.acme.Managers.ResponseManager;
import org.jboss.resteasy.reactive.RestForm;
import java.io.InputStream;
import java.util.Map;

import jakarta.inject.Inject;
import io.smallrye.mutiny.Uni;

@Path("/")
public class App {

    @Inject
    KafkaEmitter emitter;

    @Inject
    RequestManager requestManager;

    @Inject
    ResponseManager responseManager;

    @POST
    @Path("upload")
    @Consumes(MediaType.MULTIPART_FORM_DATA)
    @Produces(MediaType.APPLICATION_JSON)
    public Uni<Response> upload(@RestForm("file") FileUpload fileUpload) {
        try {
            if (fileUpload == null) {
                return Uni.createFrom().item(Response.status(Response.Status.BAD_REQUEST).entity("No file").build());
            }

            //#region Put file to disk
            java.nio.file.Path uploadedFilePath = fileUpload.uploadedFile();
            InputStream fileBody = java.nio.file.Files.newInputStream(uploadedFilePath);

            java.nio.file.Path target = java.nio.file.Paths.get("uploads", fileUpload.fileName());
            java.nio.file.Files.createDirectories(target.getParent());
            java.nio.file.Files.copy(fileBody, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            //#endregion

            String uuid = java.util.UUID.randomUUID().toString();

            requestManager.handleRequest(uuid, target.toString(), "file-upload");

            return Uni.createFrom().item(
                    Response.ok(Map.of("message", "File uploaded successfully", "uuid", uuid))
                            .build());

        } catch (Exception e) {
            return Uni.createFrom().item(Response.status(500).entity("Error uploading").build());
        }
    }

    @GET
    @Path("/result/{uuid}")
    @Produces(MediaType.APPLICATION_JSON)
    public Response checkResult(@PathParam("uuid") String uuid) {
        Map<String, Object> response = responseManager.checkResults(uuid);
        return Response.ok(response).build();
    }

    // @GET
    // @Path("/download")
    // @Produces(MediaType.APPLICATION_OCTET_STREAM)
    // public Response download() {
    //     java.nio.file.Path filePath = java.nio.file.Paths.get("app", "daemon.exe");
    //     if (!java.nio.file.Files.exists(filePath)) {
    //         return Response.status(Response.Status.NOT_FOUND).entity("File not found").build();
    //     }

    //     return Response.ok(filePath.toFile())
    //             .header("Content-Disposition", "attachment; filename=\"" + filePath.getFileName() + "\"")
    //             .build();
    // }
}
